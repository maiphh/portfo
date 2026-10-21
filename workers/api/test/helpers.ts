import { vi } from "vitest";
import type { Env } from "../src/env";
import { handle } from "../src/index";
import { env as baseEnv } from "./env";

export const ORIGIN = "https://site.test";

export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...baseEnv, ...overrides };
}

export async function call(request: Request, env: Env = testEnv()) {
  return handle(request, env);
}

export function contactRequest(
  body: Record<string, string>,
  opts: { origin?: string | null; json?: boolean; ip?: string; ua?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "CF-Connecting-IP": opts.ip ?? "203.0.113.10",
    "User-Agent": opts.ua ?? "Mozilla/5.0 (test)",
  };
  if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
  if (opts.json) {
    headers.Accept = "application/json";
    headers["Content-Type"] = "application/json";
    return new Request("https://api.test/contact", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }
  headers.Accept = "application/json";
  const form = new FormData();
  for (const [k, v] of Object.entries(body)) form.set(k, v);
  return new Request("https://api.test/contact", { method: "POST", headers, body: form });
}

export function mockResend(ok = true) {
  const seen: { url: string; body?: string; headers: Headers }[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers);
    seen.push({ url, body: init?.body ? String(init.body) : undefined, headers });
    if (url.startsWith("https://api.resend.com/emails")) {
      if (!ok) return new Response("boom", { status: 500 });
      return Response.json({ id: "re_test" });
    }
    return new Response("unexpected fetch", { status: 599 });
  });
  return { seen, spy };
}

