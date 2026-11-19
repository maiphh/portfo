import type { Env } from "../env";
import { safeEqual, sha256Hex } from "../http";
import { buildSupportCallbacks } from "./callbacks";
import { checkSupportLimit, supportIpDigest } from "./limits";
import { createPayosLink, handlePayosWebhook, PayosRequestError } from "./payos";
import { cardAdapter } from "./card";
import { reserveDonation } from "./store";
import { verifyTurnstile } from "./turnstile";
import { handleReviews } from "./reviews";
import { normalizeSupportText, validateQuote } from "./validation";

type Row = {
  id: string;
  receipt_key_hash: string;
  request_fingerprint: string;
  rail: "payos" | "polar";
  currency: "VND" | "USD";
  amount_minor: number;
  preset_count: number | null;
  status: string;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  payos_order_code: number | null;
  polar_checkout_id: string | null;
  checkout_url: string | null;
  qr_code: string | null;
};
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
const fail = (status: number, error: string, headers: Record<string, string> = {}) =>
  json({ error, message: error.replaceAll("_", " ") }, status, headers);
const status = (row: Row) => ({
  id: row.id,
  rail: row.rail,
  status:
    row.status === "creating" && Date.now() - Date.parse(row.created_at) > 30000
      ? "creation_unknown"
      : row.status === "pending" && row.expires_at && row.expires_at <= new Date().toISOString()
        ? "expired"
        : row.status,
  amountMinor: row.amount_minor,
  currency: row.currency,
  presetCount: row.preset_count,
  expiresAt: row.expires_at,
  paidAt: row.paid_at,
});
const checkout = (row: Row) => ({
  status: status(row),
  checkoutUrl: row.checkout_url,
  qrCode: row.qr_code,
  transferNote: row.payos_order_code?.toString() ?? null,
});
const lookup = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM support_donations WHERE id = ?").bind(id).first<Row>();
const uuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const keyValid = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s) && /[AEIMQUYcgkosw048]$/.test(s);
async function rawBody(req: Request, max: number): Promise<string> {
  if (Number(req.headers.get("content-length")) > max) throw 413;
  const reader = req.body?.getReader();
  if (!reader) throw 400;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw 413;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
async function readJson(req: Request): Promise<unknown> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw 415;
  try {
    return JSON.parse(await rawBody(req, 8192));
  } catch (e) {
    if (typeof e === "number") throw e;
    throw 400;
  }
}
export async function handleSupport(req: Request, env: Env): Promise<Response> {
  try {
    const path = new URL(req.url).pathname;
    if (path === "/api/support/webhooks/payos" || path === "/api/support/webhooks/polar") {
      if (req.method !== "POST") return fail(405, "method_not_allowed", { Allow: "POST" });
      if (path.endsWith("polar")) return cardAdapter.disabled();
      const raw = await rawBody(req, 65536);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return fail(400, "bad_request");
      }
      const result = await handlePayosWebhook(body, env);
      return result === 200
        ? json({ received: true })
        : fail(
            result,
            result === 403 ? "invalid_signature" : result === 400 ? "bad_request" : "unavailable",
          );
    }
    const reviewResponse = await handleReviews(req, env, readJson);
    if (reviewResponse) return reviewResponse;
    if (path === "/api/support/pay") {
      if (req.method !== "POST") return fail(405, "method_not_allowed", { Allow: "POST" });
      const data = (await readJson(req)) as Record<string, unknown>;
      if (!data || typeof data !== "object") return fail(400, "bad_request");
      if (data.rail === "polar") return cardAdapter.disabled();
      const quote = validateQuote(data.rail, data.selection);
      const name = data.displayName == null ? "" : normalizeSupportText(data.displayName, 40);
      const message =
        data.privateMessage == null ? "" : normalizeSupportText(data.privateMessage, 160, true);
      if (
        !uuid(data.id) ||
        !keyValid(data.receiptKey) ||
        !quote ||
        name === null ||
        message === null ||
        typeof data.turnstileToken !== "string"
      )
        return fail(422, "invalid_fields");
      const rail = data.rail as "payos" | "polar";
      const hash = await sha256Hex(data.receiptKey);
      const fingerprint = await sha256Hex(JSON.stringify({ rail, ...quote, name, message }));
      let row = await lookup(env, data.id);
      const replay = async (found: Row) => {
        if (!(await safeEqual(found.receipt_key_hash, hash))) return fail(404, "not_found");
        if (!(await safeEqual(found.request_fingerprint, fingerprint)))
          return fail(409, "idempotency_conflict");
        if (found.status === "creating" && Date.now() - Date.parse(found.created_at) > 30000) {
          await env.DB.prepare(
            "UPDATE support_donations SET status='creation_unknown', updated_at=? WHERE id=? AND status='creating'",
          )
            .bind(new Date().toISOString(), found.id)
            .run();
          found = (await lookup(env, found.id)) ?? found;
        }
        return found.status === "pending" &&
          status(found).status === "pending" &&
          found.checkout_url
          ? json(checkout(found))
          : json(
              status(found),
              found.status === "creating" || found.status === "creation_unknown" ? 202 : 200,
            );
      };
      if (row) return replay(row);
      if (
        env.SUPPORT_PAYOS_ENABLED !== "true" ||
        !env.SUPPORT_SITE_ORIGIN ||
        !env.SUPPORT_IP_HASH_SALT ||
        !env.TURNSTILE_SECRET_KEY
      )
        return fail(503, "not_configured");
      let callbacks;
      try {
        callbacks = buildSupportCallbacks(env.SUPPORT_SITE_ORIGIN, data.id, rail);
      } catch {
        return fail(503, "not_configured");
      }
      if (
        !(await verifyTurnstile(
          data.turnstileToken,
          env.TURNSTILE_SECRET_KEY,
          env.SUPPORT_SITE_ORIGIN,
          "support_pay",
        ))
      )
        return fail(403, "challenge_failed");
      const digest = await supportIpDigest(
        req.headers.get("cf-connecting-ip") ?? "",
        env.SUPPORT_IP_HASH_SALT,
      );
      if (!(await checkSupportLimit(env.DB, "pay", digest, 5, 3600)))
        return fail(429, "rate_limited", { "Retry-After": "3600" });
      const now = new Date();
      let reserved = false;
      let orderCode: number | null = null;
      for (let i = 0; i < 5 && !reserved; i++) {
        orderCode =
          rail === "payos"
            ? 100000000 + ((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 900000000)
            : null;
        reserved = await reserveDonation(env.DB, {
          id: data.id,
          receiptKeyHash: hash,
          fingerprint,
          rail,
          currency: quote.currency,
          amountMinor: quote.amountMinor,
          presetCount: quote.presetCount,
          displayName: name || null,
          privateMessage: message || null,
          createdAt: now.toISOString(),
          payosOrderCode: orderCode,
        });
        if (!reserved) {
          const existing = await lookup(env, data.id);
          if (existing) return replay(existing);
        }
      }
      if (!reserved) return fail(503, "unavailable");
      try {
        const expiry = new Date(now.getTime() + 1800000).toISOString();
        const provider = await createPayosLink(env, {
          orderCode: orderCode ?? 0,
          amount: quote.amountMinor,
          description: String(orderCode),
          returnUrl: callbacks.returnUrl,
          cancelUrl: callbacks.cancelUrl,
          expiredAt: Math.floor(Date.parse(expiry) / 1000),
        });
        await env.DB.prepare(
          "UPDATE support_donations SET status='pending', updated_at=?, expires_at=?, payos_link_id=?, checkout_url=?, qr_code=? WHERE id=? AND status='creating'",
        )
          .bind(
            new Date().toISOString(),
            expiry,
            provider.paymentLinkId,
            provider.checkoutUrl,
            provider.qrCode,
            data.id,
          )
          .run();
        row = await lookup(env, data.id);
        if (!row) return fail(503, "unavailable");
        return row.status === "pending" ? json(checkout(row), 201) : json(status(row), 200);
      } catch (e) {
        const uncertain = !(e instanceof PayosRequestError) || e.uncertain;
        await env.DB.prepare(
          "UPDATE support_donations SET status=?, updated_at=? WHERE id=? AND status='creating'",
        )
          .bind(uncertain ? "creation_unknown" : "failed", new Date().toISOString(), data.id)
          .run();
        return fail(uncertain ? 503 : 502, uncertain ? "unavailable" : "upstream_error");
      }
    }
    const match = path.match(/^\/api\/support\/(status|checkout|confirm)\/([^/]+)$/);
    if (!match) return fail(404, "not_found");
    const action = match[1] ?? "",
      id = match[2] ?? "";
    const method = action === "confirm" ? "POST" : "GET";
    if (req.method !== method) return fail(405, "method_not_allowed", { Allow: method });
    if (action === "confirm") return cardAdapter.disabled();
    const key = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    const row = uuid(id) ? await lookup(env, id) : null;
    if (!row || !keyValid(key) || !(await safeEqual(row.receipt_key_hash, await sha256Hex(key))))
      return fail(404, "not_found");
    if (row.rail === "polar") return cardAdapter.disabled();
    {
      if (!env.SUPPORT_IP_HASH_SALT || !env.SUPPORT_READ_LIMITER)
        return fail(503, "not_configured");
      const digest = await supportIpDigest(
        req.headers.get("cf-connecting-ip") ?? "",
        env.SUPPORT_IP_HASH_SALT,
      );
      if (!(await env.SUPPORT_READ_LIMITER.limit({ key: digest })).success)
        return fail(429, "rate_limited", { "Retry-After": "60" });
      return action === "status"
        ? json(status(row))
        : status(row).status === "pending" && row.checkout_url
          ? json(checkout(row))
          : fail(409, "checkout_inactive");
    }
    return cardAdapter.disabled();
  } catch (e) {
    if (typeof e === "number")
      return fail(
        e,
        e === 413 ? "too_large" : e === 415 ? "unsupported_media_type" : "bad_request",
      );
    return fail(503, "unavailable");
  }
}
