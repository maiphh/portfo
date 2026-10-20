/** Cloudflare Turnstile siteverify. Fails closed: no secret, a network error or a bad hostname all reject. */
export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

export async function verifyTurnstile(opts: {
  secret: string | undefined;
  token: string;
  ip: string | null;
  /** Hostnames the widget may be served from (taken from ALLOWED_ORIGINS). */
  hostnames: string[];
}): Promise<TurnstileResult> {
  if (!opts.secret) return { ok: false, reason: "not_configured" };
  if (!opts.token || opts.token.length > 2048) return { ok: false, reason: "missing_token" };
  const body = new URLSearchParams({ secret: opts.secret, response: opts.token });
  if (opts.ip) body.set("remoteip", opts.ip);
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as {
      success?: boolean;
      hostname?: string;
      "error-codes"?: string[];
    };
    if (data.success !== true)
      return { ok: false, reason: (data["error-codes"] ?? ["rejected"]).join(",") };
    if (opts.hostnames.length && (!data.hostname || !opts.hostnames.includes(data.hostname)))
      return { ok: false, reason: "hostname_mismatch" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
