import { digest, json, mediaPattern, reply, RequestError } from "./http";

const SESSION_SECONDS = 8 * 60 * 60;
const liveSession = `SELECT 1 FROM admin_sessions AS session
  JOIN admin_credentials AS credential ON credential.version = session.credential_version
  WHERE session.token_digest = ? AND session.expires_at > unixepoch()`;
const credential = `SELECT password_hash AS hash, version FROM admin_credentials
  WHERE singleton = 1`;

export async function requireSession(db: D1Database, token: string) {
  if (!mediaPattern.test(token) || !(await db.prepare(liveSession).bind(token).first()))
    throw new RequestError(401, "Sign in to continue.");
}

export async function limit(db: D1Database, request: Request, action: string, serviceKey: string) {
  const policies = {
    login: { perClient: 8, global: 60, seconds: 300 },
    "change-password": { perClient: 6, global: 30, seconds: 300 },
    submission: { perClient: 10, global: 60, seconds: 600 },
  };
  if (!(action in policies) || !Object.hasOwn(policies, action))
    throw new RequestError(404, "Unknown action.");
  const { perClient, global, seconds } = policies[action as keyof typeof policies];
  const now = Math.floor(Date.now() / 1000);
  const expiry = now - (now % seconds) + seconds;
  const client = await digest(`${serviceKey}\n${request.headers.get("X-Wall-Client") ?? ""}`);
  const attempt = crypto.randomUUID();
  const increment = `ON CONFLICT (action, client_key, expires_at) DO UPDATE
    SET attempts = attempts + 1, last_attempt = excluded.last_attempt WHERE attempts < ?`;
  // Reserve the global slot first. This bounds both the work and the number of client
  // rows even when a caller cycles through addresses.
  const [, , accepted] = await db.batch([
    db.prepare("DELETE FROM wall_admin_limits WHERE expires_at <= ?").bind(now),
    db
      .prepare(`INSERT INTO wall_admin_limits VALUES (?, 'global', ?, 1, ?) ${increment}`)
      .bind(action, expiry, attempt, global),
    db
      .prepare(
        `INSERT INTO wall_admin_limits
       SELECT ?, ?, ?, 1, ? WHERE EXISTS (
         SELECT 1 FROM wall_admin_limits WHERE action = ? AND client_key = 'global'
         AND expires_at = ? AND last_attempt = ?
       ) ${increment}`,
      )
      .bind(action, client, expiry, attempt, action, expiry, attempt, perClient),
  ]);
  if (!accepted?.meta.changes)
    return reply({ error: "Too many attempts. Please try again later." }, 429, {
      "Retry-After": String(expiry - now),
    });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function handleAuth(
  request: Request,
  db: D1Database,
  path: string,
  token: string,
): Promise<Response | undefined> {
  if (path === "GET /credential") return reply(await db.prepare(credential).first());
  if (path === "POST /credential") {
    const { hash } = await json(request);
    checkHash(hash);
    const [, row] = await db.batch([
      db
        .prepare("INSERT OR IGNORE INTO admin_credentials (singleton, password_hash) VALUES (1, ?)")
        .bind(hash),
      db.prepare(credential),
    ]);
    return reply(row?.results[0]);
  }
  if (path === "POST /session") {
    const { digest: replacement, version } = await json(request);
    checkSession(replacement, version);
    const [, created] = await db.batch([
      db.prepare("DELETE FROM admin_sessions WHERE expires_at <= unixepoch()"),
      db
        .prepare(
          `INSERT INTO admin_sessions
         SELECT ?, version, unixepoch() + ? FROM admin_credentials WHERE version = ?`,
        )
        .bind(replacement, SESSION_SECONDS, version),
    ]);
    return created?.meta.changes ? reply({ ok: true }) : reply({ error: "Sign in again." }, 401);
  }
  if (path === "DELETE /session") {
    if (mediaPattern.test(token))
      await db.prepare("DELETE FROM admin_sessions WHERE token_digest = ?").bind(token).run();
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  if (path === "GET /session" || path === "GET /session/credential") {
    await requireSession(db, token);
    if (path === "GET /session") return reply({ ok: true });
    // Bind the credential read to the requesting session even if rotation happened
    // after the initial authorization read.
    const row = await db.prepare(`${credential} AND EXISTS (${liveSession})`).bind(token).first();
    return row ? reply(row) : reply({ error: "Sign in to continue." }, 401);
  }
  if (path === "POST /session/rotate") {
    const { hash, digest: replacement, version } = await json(request);
    checkHash(hash);
    checkSession(replacement, version);
    const operation = crypto.randomUUID();
    const [updated, created] = await db.batch([
      db
        .prepare(
          `UPDATE admin_credentials SET password_hash = ?, version = version + 1,
         updated_at = unixepoch(), rotation_id = ?
         WHERE singleton = 1 AND version = ? AND EXISTS (${liveSession})`,
        )
        .bind(hash, operation, version, token),
      db
        .prepare(
          `INSERT INTO admin_sessions
         SELECT ?, version, unixepoch() + ? FROM admin_credentials WHERE rotation_id = ?`,
        )
        .bind(replacement, SESSION_SECONDS, operation),
      db
        .prepare(
          `DELETE FROM admin_sessions WHERE credential_version <
         (SELECT version FROM admin_credentials WHERE rotation_id = ?)`,
        )
        .bind(operation),
    ]);
    return updated?.meta.changes && created?.meta.changes
      ? reply({ ok: true })
      : reply({ error: "Your session changed. Sign in again." }, 401);
  }
}

function checkHash(hash: unknown): asserts hash is string {
  if (typeof hash !== "string" || !/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash))
    throw new RequestError(400, "Invalid credential.");
}

function checkSession(digest: unknown, version: unknown): asserts digest is string {
  if (typeof digest !== "string" || !mediaPattern.test(digest) || !Number.isSafeInteger(version))
    throw new RequestError(400, "Invalid session.");
}
