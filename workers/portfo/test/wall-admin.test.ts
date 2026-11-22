import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import migration from "../migrations/0002_personal_wall.sql?raw";
import adminMigration from "../migrations/0003_wall_admin.sql?raw";
import { handle } from "../src/index";
import { env } from "./env";

const key = "local-wall-admin-test-key";
const digest = "a".repeat(64);
const second = "b".repeat(64);
const thumbnail = new File(["thumbnail"], "thumbnail.webp", { type: "image/webp" });
const detail = new File(["detail"], "detail.webp", { type: "image/webp" });
const hash = (char: string) => `scrypt-v1$${char.repeat(32)}$${char.repeat(128)}`;
const photoFields = (mediaId: string) => ({
  mediaId,
  width: "100",
  height: "80",
  thumbnail,
  detail,
});
const note = {
  id: "note",
  kind: "note",
  parent: "root",
  title: "A note",
  text: "Hello",
  x: 12,
  y: -70,
};
const folder = { ...note, kind: "folder", id: "album", title: "Album" };
const media = "c".repeat(64);

beforeAll(async () => {
  const [tables, trigger] = migration.split(/(?=CREATE TRIGGER)/);
  if (!tables || !trigger) throw new Error("Missing wall schema");
  await env.DB.batch(
    `${tables}\n${adminMigration}`
      .split(";")
      .filter((sql) => sql.trim())
      .map((sql) => env.DB.prepare(sql.trim())),
  );
  await env.DB.prepare(trigger.trim()).run();
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("UPDATE wall_active SET revision_id = NULL"),
    ...[
      "wall_submissions",
      "wall_uploads",
      "wall_publish_receipts",
      "wall_draft",
      "wall_revisions",
      "admin_sessions",
      "admin_credentials",
      "wall_admin_limits",
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  ]);
  const objects = await env.WALL_MEDIA.list();
  if (objects.objects.length) await env.WALL_MEDIA.delete(objects.objects.map((item) => item.key));
});

async function request(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const res = await handle(
    new Request(new URL(path, "https://worker.test"), init),
    { ...env, WALL_ADMIN_SERVICE_KEY: key },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

function internal(
  path: string,
  method = "GET",
  payload?: FormData | Record<string, unknown>,
  token = digest,
) {
  const headers = new Headers({ "X-Wall-Service": key, "X-Wall-Session": token });
  if (payload && !(payload instanceof FormData)) headers.set("Content-Type", "application/json");
  return request(`/internal/wall-admin${path}`, {
    method,
    headers,
    body: payload instanceof FormData ? payload : payload && JSON.stringify(payload),
  });
}

async function signIn(token = digest, version = 1) {
  expect((await internal("/credential", "POST", { hash: hash("a") })).status).toBe(200);
  expect((await internal("/session", "POST", { digest: token, version })).status).toBe(200);
}

async function contribution(fields: Record<string, string | File> = {}) {
  const id = crypto.randomUUID();
  const form = new FormData();
  for (const [key, value] of Object.entries({
    id,
    fingerprint: "d".repeat(64),
    title: "Visitor card",
    body: "From a visitor",
    ...fields,
  }))
    form.set(key, value);
  expect((await internal("/submissions", "POST", form, "")).status).toBe(201);
  return { id, form };
}

describe("wall owner service", () => {
  it("denies direct requests and requires a live owner session for private routes", async () => {
    for (const [path, method] of [
      ["/credential", "GET"],
      ["/draft", "GET"],
      ["/draft", "PUT"],
      ["/submissions", "GET"],
      [`/media/${media}/detail`, "GET"],
      ["/submissions", "POST"],
      ["/draft", "OPTIONS"],
    ] as const) {
      const result = await request(`/internal/wall-admin${path}`, {
        method,
        headers: { "X-Wall-Session": digest },
      });
      expect(result.status).toBe(403);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
    }
    expect((await internal("/draft", "GET", undefined, "")).status).toBe(401);
    expect((await internal("/submissions", "GET", undefined, "")).status).toBe(401);
    expect((await internal(`/media/${media}/detail`, "GET", undefined, "")).status).toBe(401);
    await signIn();
    await env.DB.prepare("UPDATE admin_sessions SET expires_at = unixepoch()").run();
    expect((await internal("/draft")).status).toBe(401);
  });

  it("seeds once and rotates exactly one replacement under contention", async () => {
    const seeded = await Promise.all(
      ["a", "b"].map((char) => internal("/credential", "POST", { hash: hash(char) })),
    );
    const rows = await Promise.all(seeded.map((response) => response.json()));
    expect(rows[0]).toEqual(rows[1]);
    await signIn();
    await signIn(second);
    const replacements = ["c".repeat(64), "d".repeat(64)];
    const races = await Promise.all(
      replacements.map((token, index) =>
        internal(
          "/session/rotate",
          "POST",
          { hash: hash("c"), digest: token, version: 1 },
          index ? second : digest,
        ),
      ),
    );
    expect(races.map((res) => res.status).sort()).toEqual([200, 401]);
    const winner = replacements[races.findIndex((res) => res.ok)] ?? "";
    const loser = replacements[races.findIndex((res) => !res.ok)] ?? "";
    for (const revoked of [digest, second, loser])
      expect((await internal("/session", "GET", undefined, revoked)).status).toBe(401);
    expect((await internal("/session", "GET", undefined, winner)).status).toBe(200);
    expect(await (await internal("/credential")).json()).toEqual({ hash: hash("c"), version: 2 });
    expect((await internal("/session", "POST", { digest, version: 1 })).status).toBe(401);
    expect((await internal("/session", "DELETE", undefined, winner)).status).toBe(204);
    expect((await internal("/session", "DELETE", undefined, winner)).status).toBe(204);
    expect((await internal("/session", "GET", undefined, winner)).status).toBe(401);
  });

  it("enforces separate quotas, removes expired accounting, and bounds client rows globally", async () => {
    const attempt = (action: string, ip: string) =>
      request(`/internal/wall-admin/limit/${action}`, {
        method: "POST",
        headers: { "X-Wall-Service": key, "X-Wall-Client": ip },
      });
    await env.DB.prepare(
      "INSERT INTO wall_admin_limits VALUES ('login', 'expired', 1, 99, 'old')",
    ).run();
    for (let index = 0; index < 8; index++)
      expect((await attempt("login", "192.0.2.1")).status).toBe(204);
    const limited = await attempt("login", "192.0.2.1");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await attempt("submission", "192.0.2.1")).status).toBe(204);
    for (let index = 0; index < 51; index++)
      expect((await attempt("login", `198.51.100.${index}`)).status).toBe(204);
    expect((await attempt("login", "192.0.2.9")).status).toBe(429);
    const { results } = await env.DB.prepare(
      "SELECT client_key FROM wall_admin_limits WHERE client_key != 'global'",
    ).all<{ client_key: string }>();
    expect(results.every(({ client_key }) => /^[a-f0-9]{64}$/.test(client_key))).toBe(true);
  });

  it("preserves layouts, accepts large metadata, and scopes saves and resets to current versions", async () => {
    await signIn();
    expect(await (await internal("/draft")).json()).toEqual({
      version: 1,
      baseRevision: null,
      activeRevision: null,
      items: [],
    });
    const large = Array.from({ length: 275 }, (_, index) => ({
      ...note,
      id: `n${index}`,
      text: "a".repeat(5000),
      parent: folder.id,
    }));
    expect(
      (await internal("/draft", "PUT", { version: 1, items: [{ ...folder, parent: folder.id }] }))
        .status,
    ).toBe(422);
    expect(
      (await internal("/draft", "PUT", { version: 1, items: [...large, ...large] })).status,
    ).toBe(422);
    const saves = await Promise.all(
      [[folder, ...large], [note]].map((items) => internal("/draft", "PUT", { version: 1, items })),
    );
    expect(saves.map((res) => res.status).sort()).toEqual([200, 409]);
    const saved = saves.find((res) => res.ok);
    const draft = (await saved?.json()) as { items: unknown[] };
    expect(draft.items.length).toBeGreaterThan(0);
    const initialPublish = await internal("/publish", "POST", { version: 2, baseRevision: null });
    expect(initialPublish.status).toBe(200);
    const published = await initialPublish.json<{ revision: string; version: number }>();
    expect(
      await (await internal("/publish", "POST", { version: 2, baseRevision: null })).json(),
    ).toEqual(published);
    expect(await (await request("/wall")).json()).toEqual({
      revision: published.revision,
      items: draft.items,
    });
    expect((await internal("/draft", "PUT", { version: 3, items: [note] })).status).toBe(200);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO wall_revisions (id, items_json) VALUES ('cli', ?)").bind(
        JSON.stringify([folder]),
      ),
      env.DB.prepare("UPDATE wall_active SET revision_id = 'cli'"),
    ]);
    const stale = await internal("/publish", "POST", {
      version: 4,
      baseRevision: published.revision,
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ version: 4, activeRevision: "cli" });
    expect(
      (await internal("/reset", "POST", { version: 4, activeRevision: published.revision })).status,
    ).toBe(409);
    const reset = await internal("/reset", "POST", { version: 4, activeRevision: "cli" });
    expect(await reset.json()).toEqual({
      version: 5,
      baseRevision: "cli",
      activeRevision: "cli",
      items: [folder],
    });
    await env.DB.prepare("UPDATE wall_active SET revision_id = NULL").run();
    expect(await (await internal("/draft")).json()).toEqual({
      version: 6,
      baseRevision: null,
      activeRevision: null,
      items: [],
    });
  });

  it("adds accepted photos once, preserves privacy, and keeps the active revision on missing media", async () => {
    await signIn();
    const { id, form } = await contribution({ ...photoFields(media), alt: "A visitor's photo" });
    expect((await internal("/submissions", "POST", form)).status).toBe(201);
    form.set("fingerprint", "e".repeat(64));
    expect((await internal("/submissions", "POST", form)).status).toBe(409);
    const asset = `/media/${media}/thumbnail`;
    expect((await internal(asset, "GET", undefined, "")).status).toBe(401);
    expect((await internal(asset)).status).toBe(200);
    expect((await request(`/wall${asset}`)).status).toBe(404);
    const inject = { ...note, mediaId: media, kind: "photo", width: 120, height: 100 };
    expect((await internal("/draft", "PUT", { version: 1, items: [inject] })).status).toBe(422);
    expect((await internal("/draft", "PUT", { version: 1, items: [folder] })).status).toBe(200);
    const decision = `/submissions/${id}/decision`;
    expect((await internal(decision, "POST", { action: "accept", version: 1 })).status).toBe(409);
    const accepted = await internal(decision, "POST", {
      action: "accept",
      folderId: folder.id,
      version: 2,
    });
    expect(accepted.status).toBe(200);
    expect(
      await (await internal(decision, "POST", { action: "accept", version: 2 })).json(),
    ).toEqual(await accepted.json());
    expect((await internal(decision, "POST", { action: "reject" })).status).toBe(409);
    const draft = await (
      await internal("/draft")
    ).json<{ version: number; items: [{ parent: string }, { parent: string }] }>();
    expect(draft).toMatchObject({ version: 3 });
    expect(draft.items).toHaveLength(2);
    expect(draft.items[1]?.parent).toBe(folder.id);
    expect((await request(`/wall${asset}`)).status).toBe(404);
    await env.WALL_MEDIA.delete(`wall/${media}/detail.webp`);
    expect((await internal("/publish", "POST", { version: 3, baseRevision: null })).status).toBe(
      503,
    );
    expect(await (await request("/wall")).json()).toEqual({ revision: null, items: [] });
    await env.WALL_MEDIA.put(`wall/${media}/detail.webp`, "detail");
    const publishes = await Promise.all(
      [1, 2].map(() => internal("/publish", "POST", { version: 3, baseRevision: null })),
    );
    expect(publishes.map((res) => res.status)).toEqual([200, 200]);
    expect(await publishes[0]?.json()).toEqual(await publishes[1]?.json());
    expect((await request(`/wall${asset}`)).status).toBe(200);
    expect((await internal("/draft", "PUT", { version: 4, items: [folder] })).status).toBe(200);
    expect(await (await internal("/submissions?status=accepted")).json()).toMatchObject({
      items: [{ id, status: "accepted" }],
    });
  });

  it("commits one terminal decision when accept and reject race and keeps dedup provenance separate", async () => {
    await signIn();
    const { id } = await contribution({ ...photoFields(media), alt: "Private image" });
    const { version } = await (await internal("/draft")).json<{ version: number }>();
    const decision = `/submissions/${id}/decision`;
    const results = await Promise.all([
      internal(decision, "POST", { action: "accept", version }),
      internal(decision, "POST", { action: "reject" }),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    const draft = await (await internal("/draft")).json<{ version: number; items: unknown[] }>();
    const accepted = results[0]?.ok;
    expect(draft.items).toHaveLength(accepted ? 1 : 0);
    expect(draft.version).toBe(accepted ? version + 1 : version);
    const photo = new FormData();
    for (const [name, value] of Object.entries(photoFields(media))) photo.set(name, value);
    expect((await internal("/media", "POST", photo)).status).toBe(200);
    expect(
      await env.DB.prepare("SELECT owner_uploaded FROM wall_uploads WHERE media_id = ?")
        .bind(media)
        .first("owner_uploaded"),
    ).toBe(1);
    expect((await request(`/wall/media/${media}/detail`)).status).toBe(404);
  });
});
