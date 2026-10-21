import type { Config } from "./config";

export type ErrorCode =
  | "not_found"
  | "method_not_allowed"
  | "forbidden_origin"
  | "bad_request"
  | "too_long"
  | "unauthorized"
  | "rate_limited"
  | "daily_limit"
  | "not_configured"
  | "upstream_error";

export function error(
  status: number,
  code: ErrorCode,
  message: string,
  headers: HeadersInit = {},
): Response {
  return Response.json(
    { error: code, message },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

/** CORS headers for an allowed origin, or null when the origin is not allowed. */
export function corsHeaders(origin: string | null, cfg: Config): Record<string, string> | null {
  if (!origin || !cfg.origins.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withHeaders(res: Response, headers: Record<string, string> | null): Response {
  if (!headers) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

const enc = new TextEncoder();

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (hashes first, so lengths don't leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all(
    [a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))),
  );
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= (x?.[i] ?? 0) ^ (y?.[i] ?? 0);
  return diff === 0;
}
