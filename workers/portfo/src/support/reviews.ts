import type { Env } from "../env";
import { safeEqual, sha256Hex } from "../http";
import { checkSupportLimit, supportIpDigest } from "./limits";
import { signReviewToken, verifyReviewToken } from "./tokens";
import { verifyTurnstile } from "./turnstile";
import { normalizeSupportText } from "./validation";
const json = (v: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(v, { status, headers: { "Cache-Control": "no-store", ...headers } });
const fail = (status: number, error: string, headers?: Record<string, string>) =>
  json({ error, message: error.replaceAll("_", " ") }, status, headers);
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const keyValid = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(v);
type Review = {
  id: string;
  submission_key_hash: string;
  request_fingerprint: string;
  status: string;
};
export async function handleReviews(
  req: Request,
  env: Env,
  readJson: (req: Request) => Promise<unknown>,
): Promise<Response | null> {
  const url = new URL(req.url),
    path = url.pathname;
  if (path.startsWith("/api/support/admin/")) {
    const bearer = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (
      req.headers.has("Origin") ||
      !env.SUPPORT_ADMIN_TOKEN ||
      !bearer ||
      !(await safeEqual(bearer, env.SUPPORT_ADMIN_TOKEN))
    )
      return fail(401, "unauthorized");
    if (path === "/api/support/admin/reviews") {
      if (req.method !== "GET") return fail(405, "method_not_allowed", { Allow: "GET" });
      const state = url.searchParams.get("status");
      if (!state || !["pending", "approved", "rejected", "hidden"].includes(state))
        return fail(422, "invalid_fields");
      const result = await env.DB.prepare(
        "SELECT id, body AS text, display_name AS name, token_id IS NOT NULL AS supporter, status, created_at AS createdAt, moderated_at AS moderatedAt FROM support_reviews WHERE status=? ORDER BY created_at DESC, id DESC LIMIT 50",
      )
        .bind(state)
        .all();
      return json({
        reviews: result.results.map((r) => ({ ...r, supporter: Boolean(r.supporter) })),
      });
    }
    const review = path.match(/^\/api\/support\/admin\/reviews\/([^/]+)$/);
    if (review) {
      if (req.method !== "POST") return fail(405, "method_not_allowed", { Allow: "POST" });
      const body = (await readJson(req)) as { action?: string } | null;
      const transitions: Record<string, [string, string]> = {
        approve: ["pending", "approved"],
        reject: ["pending", "rejected"],
        hide: ["approved", "hidden"],
      };
      const transition = body?.action ? transitions[body.action] : undefined;
      if (!transition || !uuid(review[1])) return fail(422, "invalid_fields");
      await env.DB.prepare(
        "UPDATE support_reviews SET status=?, moderated_at=? WHERE id=? AND status=?",
      )
        .bind(transition[1], new Date().toISOString(), review[1], transition[0])
        .run();
      const row = await env.DB.prepare("SELECT status FROM support_reviews WHERE id=?")
        .bind(review[1])
        .first<{ status: string }>();
      if (!row) return fail(404, "not_found");
      return row.status === transition[1]
        ? json({ id: review[1], status: row.status })
        : fail(409, "invalid_transition");
    }
    if (path === "/api/support/admin/donations") {
      if (req.method !== "GET") return fail(405, "method_not_allowed", { Allow: "GET" });
      const result = await env.DB.prepare(
        "SELECT id, display_name AS name, private_message AS privateMessage, paid_at AS paidAt, supporter_hidden_at IS NOT NULL AS supporterHidden FROM support_donations WHERE status='paid' ORDER BY paid_at DESC,id DESC LIMIT 50",
      ).all();
      return json({
        donations: result.results.map((r) => ({
          ...r,
          supporterHidden: Boolean(r.supporterHidden),
        })),
      });
    }
    const donation = path.match(/^\/api\/support\/admin\/donations\/([^/]+)$/);
    if (donation) {
      if (req.method !== "POST") return fail(405, "method_not_allowed", { Allow: "POST" });
      const body = (await readJson(req)) as { action?: string } | null;
      if (body?.action !== "hide_supporter" || !uuid(donation[1]))
        return fail(422, "invalid_fields");
      const result = await env.DB.prepare(
        "UPDATE support_donations SET supporter_hidden_at=COALESCE(supporter_hidden_at, ?) WHERE id=? AND status='paid'",
      )
        .bind(new Date().toISOString(), donation[1])
        .run();
      return result.meta.changes
        ? json({ id: donation[1], supporterHidden: true })
        : fail(404, "not_found");
    }
    return fail(404, "not_found");
  }
  if (path === "/api/support/wall") {
    if (req.method !== "GET") return fail(405, "method_not_allowed", { Allow: "GET" });
    if (!env.SUPPORT_IP_HASH_SALT || !env.SUPPORT_READ_LIMITER) return fail(503, "not_configured");
    const digest = await supportIpDigest(
      req.headers.get("cf-connecting-ip") ?? "",
      env.SUPPORT_IP_HASH_SALT,
    );
    if (!(await env.SUPPORT_READ_LIMITER.limit({ key: digest })).success)
      return fail(429, "rate_limited", { "Retry-After": "60" });
    const [reviews, supporters] = await env.DB.batch([
      env.DB.prepare(
        "SELECT display_name AS name, body AS text, token_id IS NOT NULL AS supporter, moderated_at AS approvedAt FROM support_reviews WHERE status='approved' ORDER BY moderated_at DESC,id DESC LIMIT 30",
      ),
      env.DB.prepare(
        "SELECT display_name AS name, preset_count AS presetCount, substr(paid_at,1,7) AS month FROM support_donations WHERE status='paid' AND display_name IS NOT NULL AND display_name <> '' AND supporter_hidden_at IS NULL ORDER BY paid_at DESC,id DESC LIMIT 30",
      ),
    ]);
    return json({
      reviews: (reviews?.results ?? []).map((value) => {
        const r = value as Record<string, unknown>;
        return { ...r, supporter: Boolean(r.supporter) };
      }),
      supporters: supporters?.results ?? [],
    });
  }
  const claim = path.match(/^\/api\/support\/review-token\/([^/]+)$/);
  if (claim) {
    if (req.method !== "POST") return fail(405, "method_not_allowed", { Allow: "POST" });
    const id = claim[1] ?? "";
    const key = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    const donation = uuid(id)
      ? await env.DB.prepare(
          "SELECT receipt_key_hash, status, paid_at FROM support_donations WHERE id=?",
        )
          .bind(id)
          .first<{ receipt_key_hash: string; status: string; paid_at: string | null }>()
      : null;
    if (
      !donation ||
      !keyValid(key) ||
      !(await safeEqual(donation.receipt_key_hash, await sha256Hex(key)))
    )
      return fail(404, "not_found");
    const body = await readJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)
      return fail(422, "invalid_fields");
    if (!env.SUPPORT_REVIEW_SIGNING_KEY) return fail(503, "not_configured");
    if (!(await checkSupportLimit(env.DB, "claim", id, 12, 60)))
      return fail(429, "rate_limited", { "Retry-After": "60" });
    if (donation.status !== "paid" || !donation.paid_at) return fail(409, "payment_unconfirmed");
    const expiresAt = new Date(Date.parse(donation.paid_at) + 7 * 86400000).toISOString(),
      now = new Date().toISOString();
    if (expiresAt <= now) return fail(410, "token_unavailable");
    await env.DB.prepare(
      "INSERT INTO support_review_tokens (id,donation_id,issued_at,expires_at) VALUES (?,?,?,?) ON CONFLICT(donation_id) DO NOTHING",
    )
      .bind(crypto.randomUUID(), id, now, expiresAt)
      .run();
    const token = await env.DB.prepare(
      "SELECT id, expires_at, used_at FROM support_review_tokens WHERE donation_id=?",
    )
      .bind(id)
      .first<{ id: string; expires_at: string; used_at: string | null }>();
    if (!token || token.used_at || token.expires_at <= now) return fail(410, "token_unavailable");
    return json({
      reviewToken: await signReviewToken(
        { id: token.id, donationId: id, expiresAt: token.expires_at },
        env.SUPPORT_REVIEW_SIGNING_KEY,
      ),
      expiresAt: token.expires_at,
    });
  }
  if (path !== "/api/support/review") return null;
  if (req.method !== "POST") return fail(405, "method_not_allowed", { Allow: "POST" });
  const data = (await readJson(req)) as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || Array.isArray(data)) return fail(400, "bad_request");
  const body = normalizeSupportText(data.text, 240, true),
    name = data.displayName == null ? "" : normalizeSupportText(data.displayName, 40);
  if (
    !uuid(data.submissionId) ||
    !keyValid(data.submissionKey) ||
    body === null ||
    body.length < 10 ||
    name === null ||
    typeof data.turnstileToken !== "string" ||
    (data.reviewToken != null && typeof data.reviewToken !== "string")
  )
    return fail(422, "invalid_fields");
  const hash = await sha256Hex(data.submissionKey),
    fingerprint = await sha256Hex(JSON.stringify({ body, name, token: data.reviewToken ?? null }));
  const replay = async (row: Review) =>
    !(await safeEqual(row.submission_key_hash, hash))
      ? fail(404, "not_found")
      : !(await safeEqual(row.request_fingerprint, fingerprint))
        ? fail(409, "idempotency_conflict")
        : json({ id: row.id, status: row.status });
  const find = () =>
    env.DB.prepare(
      "SELECT id, submission_key_hash, request_fingerprint, status FROM support_reviews WHERE id=?",
    )
      .bind(data.submissionId)
      .first<Review>();
  const existing = await find();
  if (existing) return replay(existing);
  if (
    !env.SUPPORT_IP_HASH_SALT ||
    !env.SUPPORT_SITE_ORIGIN ||
    !env.TURNSTILE_SECRET_KEY ||
    (data.reviewToken != null && !env.SUPPORT_REVIEW_SIGNING_KEY)
  )
    return fail(503, "not_configured");
  const claims =
    data.reviewToken != null
      ? await verifyReviewToken(data.reviewToken as string, env.SUPPORT_REVIEW_SIGNING_KEY ?? "")
      : null;
  if (data.reviewToken != null && !claims)
    return json(
      {
        error: "token_unavailable",
        message: "Token unavailable. You can submit without a supporter badge.",
      },
      409,
    );
  if (
    !(await verifyTurnstile(
      data.turnstileToken,
      env.TURNSTILE_SECRET_KEY,
      env.SUPPORT_SITE_ORIGIN,
      "support_review",
    ))
  )
    return fail(403, "challenge_failed");
  const digest = await supportIpDigest(
    req.headers.get("cf-connecting-ip") ?? "",
    env.SUPPORT_IP_HASH_SALT,
  );
  if (!(await checkSupportLimit(env.DB, "review", digest, 5, 3600)))
    return fail(429, "rate_limited", { "Retry-After": "3600" });
  const now = new Date().toISOString(),
    cutoff = new Date(Date.now() - 86400000).toISOString();
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO support_reviews (id,submission_key_hash,request_fingerprint,token_id,display_name,body,status,created_at,ip_digest)
      SELECT ?,?,?,?,?,?,'pending',?,? WHERE (SELECT count(*) FROM support_reviews WHERE status='pending' AND ip_digest=? AND created_at>=?) < 3
      AND (? IS NULL OR EXISTS (SELECT 1 FROM support_review_tokens t JOIN support_donations d ON d.id=t.donation_id WHERE t.id=? AND t.donation_id=? AND t.expires_at=? AND t.expires_at>? AND t.used_at IS NULL AND d.status='paid')) ON CONFLICT DO NOTHING`,
    ).bind(
      data.submissionId,
      hash,
      fingerprint,
      claims?.id ?? null,
      name || null,
      body,
      now,
      digest,
      digest,
      cutoff,
      claims?.id ?? null,
      claims?.id ?? null,
      claims?.donationId ?? null,
      claims?.expiresAt ?? null,
      now,
    ),
    env.DB.prepare(
      "UPDATE support_review_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND EXISTS (SELECT 1 FROM support_reviews WHERE id=? AND token_id=support_review_tokens.id)",
    ).bind(now, claims?.id ?? null, data.submissionId),
  ]);
  if (result[0]?.meta.changes) return json({ id: data.submissionId, status: "pending" }, 201);
  const raced = await find();
  if (raced) return replay(raced);
  if (claims) {
    const available = await env.DB.prepare(
      "SELECT 1 FROM support_review_tokens t JOIN support_donations d ON d.id=t.donation_id WHERE t.id=? AND t.donation_id=? AND t.expires_at=? AND t.expires_at>? AND t.used_at IS NULL AND d.status='paid'",
    )
      .bind(claims.id, claims.donationId, claims.expiresAt, now)
      .first();
    if (!available)
      return json(
        {
          error: "token_unavailable",
          message: "Token unavailable. You can submit without a supporter badge.",
        },
        409,
      );
  }
  return fail(429, "pending_limit", { "Retry-After": "86400" });
}
