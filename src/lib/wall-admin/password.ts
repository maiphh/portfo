import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { APIContext } from "astro";
import { getSecret } from "astro:env/server";
import { COOKIE, SESSION_AGE, digest, forward, response, worker } from "./server";

const hashPattern = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
interface Credential {
  hash: string;
  version: number;
}

function bounded(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    Buffer.byteLength(value) <= 512 &&
    Buffer.from(value).toString() === value
  );
}

function validNew(value: unknown): value is string {
  if (!bounded(value)) return false;
  const count = [...value].length;
  return count >= 8 && count <= 128;
}

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hash(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verify(password: string, stored: string) {
  const [, salt, expected] = hashPattern.exec(stored) ?? [];
  if (!salt || !expected) throw new Error("Unsupported credential format");
  return timingSafeEqual(
    await derive(password, Buffer.from(salt, "hex")),
    Buffer.from(expected, "hex"),
  );
}

function cookieSettings(context: APIContext) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: context.url.protocol === "https:",
    path: "/",
  };
}

function setSession(context: APIContext, token: string) {
  context.cookies.set(COOKIE, token, { ...cookieSettings(context), maxAge: SESSION_AGE });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function signIn(context: APIContext, { password }: Record<string, unknown>) {
  const limited = await worker(context, "/limit/login", { method: "POST", client: true });
  if (!limited.ok) return forward(limited);
  let found = await worker(context, "/credential");
  if (!found.ok) return workerFailure(found);
  let record: Credential | null = await found.json();
  if (!record) {
    const bootstrap = getSecret("ADMIN_BOOTSTRAP_PASSWORD");
    if (!validNew(bootstrap)) return response({ error: "Owner sign-in is not configured." }, 503);
    if (!bounded(password)) return invalidPassword();
    found = await worker(context, "/credential", {
      method: "POST",
      body: { hash: await hash(bootstrap) },
    });
    if (!found.ok) return workerFailure(found);
    record = await found.json();
  }
  if (!record || !bounded(password) || !(await verify(password, record.hash)))
    return invalidPassword();
  const token = randomBytes(32).toString("hex");
  const saved = await worker(context, "/session", {
    method: "POST",
    body: { digest: digest(token), version: record.version },
  });
  if (!saved.ok) return saved.status === 401 ? invalidPassword() : workerFailure(saved);
  return setSession(context, token);
}

function invalidPassword() {
  return response({ error: "Invalid password." }, 401);
}

function workerFailure(result: Response) {
  return response(
    {
      error:
        result.status === 401
          ? "Your session expired. Sign in again."
          : "The owner service is temporarily unavailable. Please retry.",
    },
    result.status === 401 ? 401 : 503,
  );
}

export async function changePassword(context: APIContext, input: Record<string, unknown>) {
  const { currentPassword, newPassword, confirmation } = input;
  const record = await worker(context, "/session/credential");
  if (!record.ok) return workerFailure(record);
  const limited = await worker(context, "/limit/change-password", { method: "POST", client: true });
  if (!limited.ok) return forward(limited);
  const errors: Record<string, string> = {};
  if (!bounded(currentPassword)) errors.currentPassword = "Enter your current password.";
  if (!validNew(newPassword))
    errors.newPassword = "Use 8–128 characters and up to 512 UTF-8 bytes.";
  else if (newPassword === currentPassword) errors.newPassword = "Choose a different password.";
  if (newPassword !== confirmation || !bounded(confirmation))
    errors.confirmation = "Enter the new password again.";
  if (!bounded(currentPassword) || !validNew(newPassword) || Object.keys(errors).length)
    return response({ error: "Check the highlighted fields.", fields: errors }, 422);

  const credential: Credential = await record.json();
  if (!(await verify(currentPassword, credential.hash)))
    return response(
      {
        error: "Check the highlighted field.",
        fields: { currentPassword: "The current password is incorrect." },
      },
      422,
    );

  const token = randomBytes(32).toString("hex");
  const rotated = await worker(context, "/session/rotate", {
    method: "POST",
    body: { hash: await hash(newPassword), digest: digest(token), version: credential.version },
  });
  if (!rotated.ok) return workerFailure(rotated);
  return setSession(context, token);
}

export async function signOut(context: APIContext) {
  const signedOut = await worker(context, "/session", { method: "DELETE" });
  if (!signedOut.ok) return workerFailure(signedOut);
  context.cookies.delete(COOKIE, cookieSettings(context));
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
