const encoder = new TextEncoder();

export async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(message)));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const mac = await hmacSha256(encoder.encode(secret), message);
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
