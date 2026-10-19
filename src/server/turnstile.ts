/**
 * Cloudflare Turnstile server-side verification.
 *
 * - TURNSTILE_SECRET_KEY set: the token is verified with Cloudflare (fails closed on errors).
 * - Unset in dev/test: verification is skipped, with a log line.
 * - Unset in production (VERCEL_ENV or NODE_ENV = production): fails closed.
 */
import { isProduction, type Env, type Logger } from "./env";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: "missing_token" | "rejected" | "error" | "not_configured" };

export interface TurnstileOptions {
  env: Env;
  log: Logger;
  fetch?: typeof fetch;
}

export async function verifyTurnstile(
  token: string | undefined,
  ip: string | undefined,
  { env, log, fetch: doFetch = fetch }: TurnstileOptions,
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (isProduction(env)) {
      log.error(
        "[turnstile] TURNSTILE_SECRET_KEY is missing in production; rejecting (fail closed).",
      );
      return { ok: false, reason: "not_configured" };
    }
    log.warn("[turnstile] TURNSTILE_SECRET_KEY is not set; skipping verification (dev/test only).");
    return { ok: true, skipped: true };
  }
  if (!token) return { ok: false, reason: "missing_token" };

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await doFetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success === true) return { ok: true, skipped: false };
    log.warn("[turnstile] token rejected", data["error-codes"] ?? []);
    return { ok: false, reason: "rejected" };
  } catch (err) {
    log.error("[turnstile] verification failed", err);
    return { ok: false, reason: "error" };
  }
}
