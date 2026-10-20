import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env as baseEnv } from "cloudflare:workers";
import { vi } from "vitest";
import { config } from "../src/config";
import { EMBED_DIMS, EMBED_MODEL } from "../src/config";
import type { AiBinding, Env, VectorIndex } from "../src/env";
import { handle } from "../src/index";
import type { ToolContext } from "../src/tools";

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

/**
 * A scripted model: each chat call takes the next reply (or calls `script(inputs)`);
 * embedding calls return deterministic 1024-dim vectors.
 */
export function fakeAi(script: Reply[] | ((inputs: Record<string, unknown>, n: number) => Reply)) {
  const calls: AiCall[] = [];
  let n = 0;
  const ai: AiBinding = {
    async run(model, inputs) {
      calls.push({ model, inputs });
      if (model === EMBED_MODEL) {
        const text = inputs.text as string[];
        return {
          shape: [text.length, EMBED_DIMS],
          data: text.map((_, i) => Array.from({ length: EMBED_DIMS }, (_, j) => ((i + j) % 7) / 7)),
        };
      }
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
  return { ai, calls, chatCalls: () => calls.filter((c) => c.model !== EMBED_MODEL) };
}

/* ---------- Vectorize ---------- */

export interface Match {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export function fakeVectorize(matches: Match[] = []) {
  const upserts: { id: string; values: number[]; metadata?: Record<string, unknown> }[] = [];
  const deletes: string[] = [];
  const queries: { vector: number[]; options: unknown }[] = [];
  const index: VectorIndex = {
    async query(vector, options) {
      queries.push({ vector, options });
      return { matches: matches.slice(0, options.topK) };
    },
    async upsert(v) {
      upserts.push(...v);
      return { mutationId: "m1" };
    },
    async deleteByIds(ids) {
      deletes.push(...ids);
      return { mutationId: "m2" };
    },
  };
  return { index, upserts, deletes, queries };
}

export const talentnetMatch: Match = {
  id: "document-ocr:0",
  score: 0.82,
  metadata: {
    title: "Document OCR pipeline",
    href: "/work/document-ocr",
    text: "I built this pipeline on my own at Talentnet. It runs in production.",
  },
};

/* ---------- outbound fetch: Turnstile + the site's APIs ---------- */

export const activityOk = {
  status: "ok",
  summary: {
    publicRepos: 12,
    commitsLastYear: 340,
    streakDays: 4,
    lastSyncedAt: "2026-10-20T00:17:00.000Z",
    heatmap: [],
    feed: [{ kind: "commit", text: "3 commits to maiphh/portfo", when: "today" }],
  },
  repos: [
    {
      name: "portfo",
      url: "https://github.com/maiphh/portfo",
      description: "Portfolio",
      language: "TypeScript",
      stars: 1,
      topics: [],
      pushedAt: new Date().toISOString(),
    },
    {
      name: "openportfo",
      url: "https://github.com/maiphh/openportfo",
      description: null,
      language: "Python",
      stars: 3,
      topics: [],
      pushedAt: "2026-09-01T00:00:00Z",
    },
    {
      name: "poet",
      url: "https://github.com/maiphh/poet",
      description: null,
      language: "TypeScript",
      stars: 0,
      topics: [],
      pushedAt: "2026-05-01T00:00:00Z",
    },
  ],
};

export const popularOk = {
  items: [
    { slug: "legal-rag", title: "Legal RAG assistant", href: "/#work-rag", views: 41 },
    { slug: "document-ocr", title: "Document OCR pipeline", href: "/#work-ocr", views: 30 },
  ],
  since: "2026-10-13T00:00:00.000Z",
  days: 7,
};

export interface FetchRoutes {
  turnstile?: { success: boolean; hostname?: string } | "error";
  activity?: unknown;
  popular?: unknown;
  status?: number;
}

/** Replaces global fetch for one test. Returns the requests made. */
export function mockFetch(routes: FetchRoutes = {}) {
  const seen: { url: string; body?: string }[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    seen.push({ url, body: init?.body ? String(init.body) : undefined });
    if (url.startsWith("https://challenges.cloudflare.com/turnstile/v0/siteverify")) {
      if (routes.turnstile === "error") throw new Error("network");
      return Response.json(routes.turnstile ?? { success: true, hostname: "site.test" });
    }
    const status = routes.status ?? 200;
    if (url.startsWith("https://site.test/api/activity"))
      return Response.json(routes.activity ?? activityOk, { status });
    if (url.startsWith("https://site.test/api/popular"))
      return Response.json(routes.popular ?? popularOk, { status });
    return new Response("unexpected fetch in test", { status: 599 });
  });
  return { seen, spy };
}

/* ---------- requests ---------- */

let ipSeq = 0;
/** A fresh visitor IP per call site, so rate limits don't leak between tests. */
export const freshIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`;

export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...(baseEnv as unknown as Env), ...overrides };
}

export async function call(request: Request, env: Env) {
  const ctx = createExecutionContext();
  const res = await handle(request, env, ctx);
  const text = res.body ? await res.text() : "";
  await waitOnExecutionContext(ctx);
  return { res, text };
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
  return new Request("https://chat.test/chat", {
    method: opts.method ?? "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
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
