/**
 * Short-lived signed session token, issued on a session's first message:
 * `v1.<payload base64url>.<HMAC-SHA256 base64url>`. Later messages send it until it expires.
 */
import { SESSION_TTL_MS } from "./config";

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface Session {
  sid: string;
  exp: number;
}

export async function issueSession(
  secret: string,
  now = Date.now(),
): Promise<{ token: string; session: Session }> {
  const session: Session = { sid: crypto.randomUUID(), exp: now + SESSION_TTL_MS };
  const payload = b64url(enc.encode(JSON.stringify(session)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await key(secret), enc.encode(`v1.${payload}`)),
  );
  return { token: `v1.${payload}.${b64url(sig)}`, session };
}

export async function verifySession(
  secret: string,
  token: string | undefined,
  now = Date.now(),
): Promise<Session | null> {
  if (!token || token.length > 512) return null;
  const [v, payload, sig] = token.split(".");
  if (v !== "v1" || !payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      fromB64url(sig),
      enc.encode(`v1.${payload}`),
    );
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Partial<Session>;
    if (typeof s.sid !== "string" || typeof s.exp !== "number" || s.exp <= now) return null;
    return { sid: s.sid, exp: s.exp };
  } catch {
    return null;
  }
}
