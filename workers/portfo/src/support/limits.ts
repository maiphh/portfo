import { hmacHex } from "./crypto";

export async function supportIpDigest(ip: string, salt: string): Promise<string> {
  if (!salt || !ip) throw new Error("Support rate limiting unavailable");
  return hmacHex(salt, `support-ip:v1:${ip}`);
}

/** Conditional upsert admits at most limit mutations in the fixed window. */
export async function checkSupportLimit(
  db: D1Database,
  scope: string,
  digest: string,
  limit: number,
  seconds: number,
  now = Date.now(),
): Promise<boolean> {
  const window = new Date(Math.floor(now / (seconds * 1000)) * seconds * 1000).toISOString();
  const result = await db
    .prepare(
      `INSERT INTO support_rate_limits (scope, key_digest, window_start, counter)
    VALUES (?, ?, ?, 1) ON CONFLICT(scope, key_digest, window_start)
    DO UPDATE SET counter = counter + 1 WHERE counter < ? RETURNING counter`,
    )
    .bind(scope, digest, window, limit)
    .first();
  return result !== null;
}
