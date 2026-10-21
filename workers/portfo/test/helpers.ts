import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { vi } from "vitest";
import { config } from "../src/config";
import type { AiBinding, Env } from "../src/env";
import { FakeGithubProvider, repo } from "../src/github/fake";
import { runGithubSync } from "../src/github/sync";
import { handle } from "../src/index";
import type { ToolContext } from "../src/tools";
import { env as baseEnv } from "./env";

export const ORIGIN = "https://site.test";

/* ---------- Workers AI ---------- */

export type Reply =
  | { text: string }
  | { calls: { name: string; args?: unknown }[]; text?: string }
  | { raw: unknown }
  | { throws: string };

export interface AiCall {
  model: string;
  inputs: Record<string, unknown>;
}

/** A scripted model: each chat call takes the next reply (or calls `script(inputs)`). */
export function fakeAi(script: Reply[] | ((inputs: Record<string, unknown>, n: number) => Reply)) {
  const calls: AiCall[] = [];
  let n = 0;
  const ai: AiBinding = {
    async run(model, inputs) {
      calls.push({ model, inputs });
      const r = typeof script === "function" ? script(inputs, n++) : script[n++];
      if (!r) throw new Error(`fake AI: no scripted reply #${n}`);
      if ("throws" in r) throw new Error(r.throws);
      if ("raw" in r) return r.raw;
      if ("calls" in r)
        return {
          response: r.text ?? null,
          tool_calls: r.calls.map((c) => ({ name: c.name, arguments: c.args ?? {} })),
        };
      return { response: r.text, tool_calls: [] };
    },
  };
  return { ai, calls, chatCalls: () => calls };
}

/* ---------- requests ---------- */

let ipSeq = 0;
/** A fresh visitor IP per call site, so rate limits don't leak between tests. */
export const freshIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`;

export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...baseEnv, ...overrides };
}

export async function call(request: Request, env: Env = testEnv()) {
  const ctx = createExecutionContext();
  const res = await handle(request, env, ctx);
  const text = res.body ? await res.text() : "";
  await waitOnExecutionContext(ctx);
  // 204/205/304 must not carry a body, even an empty string.
  const body = [204, 205, 304].includes(res.status) ? null : text;
  return { res: new Response(body, res), text };
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
    return new Request("https://worker.test/contact", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }
  headers.Accept = "application/json";
  const form = new FormData();
  for (const [k, v] of Object.entries(body)) form.set(k, v);
  return new Request("https://worker.test/contact", { method: "POST", headers, body: form });
}

export function chatRequest(
  body: unknown,
  opts: { ip?: string; origin?: string | null; method?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "CF-Connecting-IP": opts.ip ?? freshIp(),
  };
  if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
  return new Request("https://worker.test/chat", {
    method: opts.method ?? "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
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

/** Replaces global fetch for one test (e.g. Resend). Returns the requests made. */
export function mockFetch() {
  const seen: { url: string; body?: string }[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    seen.push({ url, body: init?.body ? String(init.body) : undefined });
    return new Response("unexpected fetch in test", { status: 599 });
  });
  return { seen, spy };
}

export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

export function parseSse(text: string): SseEvent[] {
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((b) => {
      const event = /^event: (.+)$/m.exec(b)?.[1] ?? "message";
      const data = JSON.parse(/^data: (.+)$/m.exec(b)?.[1] ?? "{}") as Record<string, unknown>;
      return { event, data };
    });
}

export const answerText = (events: SseEvent[]) =>
  events
    .filter((e) => e.event === "token")
    .map((e) => String(e.data.text))
    .join("");

export function toolCtx(env: Partial<Env> = {}): ToolContext {
  const e = testEnv(env);
  return { env: e, cfg: config(e) };
}

/** Seed D1 with a small GitHub snapshot for chat tool tests. */
export async function seedGithubActivity(db: D1Database = baseEnv.DB) {
  const now = new Date().toISOString();
  await runGithubSync({
    db,
    provider: new FakeGithubProvider(
      [
        repo({
          repoId: 1,
          name: "portfo",
          description: "Portfolio",
          language: "TypeScript",
          stars: 1,
          pushedAt: now,
        }),
        repo({
          repoId: 2,
          name: "openportfo",
          language: "Python",
          stars: 3,
          pushedAt: "2026-09-01T00:00:00Z",
        }),
        repo({
          repoId: 3,
          name: "poet",
          language: "TypeScript",
          stars: 0,
          pushedAt: "2026-05-01T00:00:00Z",
        }),
      ],
      Array.from({ length: 340 }, (_, i) => ({
        repoId: 1,
        kind: "commit" as const,
        occurredAt: new Date(Date.now() - (i % 100) * 86_400_000).toISOString(),
        count: 1,
      })),
    ),
    log: { info() {}, warn() {}, error() {} },
    login: "maiphh",
  });
}

export async function seedPopularViews(db: D1Database = baseEnv.DB) {
  const t = new Date(Date.now() - 86_400_000).toISOString();
  const day = t.slice(0, 10);
  const rows: [string, string][] = [
    ...Array.from({ length: 41 }, (_, i) => ["legal-rag", `v-rag-${i}`] as [string, string]),
    ...Array.from({ length: 30 }, (_, i) => ["document-ocr", `v-ocr-${i}`] as [string, string]),
  ];
  for (const [slug, visitor] of rows) {
    await db
      .prepare(
        `INSERT INTO page_views (slug, visitor_hash, referrer_host, day, created_at)
         VALUES (?, ?, NULL, ?, ?)`,
      )
      .bind(slug, visitor, day, t)
      .run();
  }
}
