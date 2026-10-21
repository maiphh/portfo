/** Reads the POST body (form or JSON) and the client IP. */
export const MAX_BODY_BYTES = 16 * 1024;

export class BodyTooLargeError extends Error {}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new BodyTooLargeError();
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new BodyTooLargeError();
    const data: unknown = JSON.parse(text);
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  }
  const form = await request.formData();
  const out: Record<string, unknown> = {};
  for (const [k, v] of form) if (typeof v === "string") out[k] = v;
  return out;
}

export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) return fwd;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}
