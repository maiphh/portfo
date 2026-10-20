import { runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saigonDay } from "../src/config";
import { DAILY_LIMIT_MESSAGE } from "../src/prompt";
import { issueSession, verifySession } from "../src/session";
import {
  answerText,
  call,
  chatRequest,
  fakeAi,
  fakeVectorize,
  freshIp,
  mockFetch,
  ORIGIN,
  parseSse,
  talentnetMatch,
  testEnv,
  type Reply,
} from "./helpers";

afterEach(() => vi.restoreAllMocks());

const happyScript = (): Reply[] => [
  { calls: [{ name: "search_knowledge", args: { query: "OCR pipeline" } }] },
  { text: "He built a document OCR pipeline at Talentnet that runs in production." },
];
const q = (content = "What did he build?") => ({ messages: [{ role: "user", content }] });

function env(overrides: Parameters<typeof testEnv>[0] = {}, script: Reply[] = happyScript()) {
  const ai = fakeAi(script);
  return {
    ai,
    env: testEnv({ AI: ai.ai, VECTORIZE: fakeVectorize([talentnetMatch]).index, ...overrides }),
  };
}

describe("POST /chat happy path", () => {
  it("streams session, status, tokens, then sources and done over SSE", async () => {
    const f = mockFetch();
    const { env: e } = env();
    const { res, text } = await call(chatRequest({ ...q(), turnstileToken: "tok" }), e);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);

    const events = parseSse(text);
    expect(events.map((x) => x.event).filter((n, i, a) => a.indexOf(n) === i)).toEqual([
      "session",
      "status",
      "token",
      "sources",
      "done",
    ]);
    expect(events.find((x) => x.event === "status")?.data).toEqual({
      tool: "search_knowledge",
      label: "Searching the CV and case studies…",
      round: 1,
    });
    expect(answerText(events)).toBe(
      "He built a document OCR pipeline at Talentnet that runs in production.",
    );
    expect(events.at(-2)).toEqual({
      event: "sources",
      data: { sources: [{ title: "Document OCR pipeline", href: "/work/document-ocr" }] },
    });
    expect(events.at(-1)?.data).toMatchObject({
      rounds: 1,
      model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    });

    const session = events[0]?.data as { token: string; expiresAt: number };
    expect(await verifySession("test-session-key", session.token)).not.toBeNull();
    const verify = f.seen.find((s) => s.url.includes("siteverify"));
    expect(verify?.body).toContain("secret=test-turnstile-secret");
    expect(verify?.body).toContain("response=tok");
  });

  it("accepts a valid session token instead of Turnstile on later messages", async () => {
    const f = mockFetch();
    const { token } = await issueSession("test-session-key");
    const { res, text } = await call(chatRequest({ ...q(), sessionToken: token }), env().env);
    expect(res.status).toBe(200);
    expect(parseSse(text).some((x) => x.event === "session")).toBe(false);
    expect(f.seen.some((s) => s.url.includes("siteverify"))).toBe(false);
  });

  it("only keeps the last 6 turns and sends an error event if the model is down", async () => {
    mockFetch();
    const long = Array.from({ length: 9 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `turn ${i}`,
    }));
    const { ai, env: e } = env({}, [{ throws: "down" }, { throws: "down too" }]);
    const { res, text } = await call(chatRequest({ messages: long, turnstileToken: "tok" }), e);
    expect(res.status).toBe(200);
    const sent = ai.chatCalls()[0]?.inputs.messages as { role: string }[];
    expect(sent).toHaveLength(1 + 6);
    const events = parseSse(text);
    expect(events.find((x) => x.event === "error")?.data.error).toBe("upstream_error");
    expect(events.at(-1)?.event).toBe("sources");
  });
});

describe("Turnstile", () => {
  it("requires a token on the first message", async () => {
    mockFetch();
    const { res, text } = await call(chatRequest(q()), env().env);
    expect(res.status).toBe(401);
    expect(JSON.parse(text).error).toBe("turnstile_required");
  });

  it("rejects a failed token, a wrong hostname, a network error and a forged session", async () => {
    for (const turnstile of [
      { success: false },
      { success: true, hostname: "evil.test" },
      "error",
    ] as const) {
      vi.restoreAllMocks();
      mockFetch({ turnstile });
      const { ai, env: e } = env();
      const { res, text } = await call(chatRequest({ ...q(), turnstileToken: "bad" }), e);
      expect(res.status).toBe(403);
      expect(JSON.parse(text).error).toBe("turnstile_failed");
      expect(ai.calls).toHaveLength(0);
    }
    const { res } = await call(chatRequest({ ...q(), sessionToken: "v1.e30.forged" }), env().env);
    expect(res.status).toBe(401);
  });

  it("fails closed without TURNSTILE_SECRET_KEY", async () => {
    mockFetch();
    const { res } = await call(
      chatRequest({ ...q(), turnstileToken: "tok" }),
      env({ TURNSTILE_SECRET_KEY: undefined }).env,
    );
    expect(res.status).toBe(403);
  });
});

describe("rate limits", () => {
  it("allows 10 messages per visitor per 10 minutes, then 429 with Retry-After", async () => {
    mockFetch();
    const ip = freshIp();
    const { env: e } = env({ VISITOR_LIMIT: "2" }, []);
    // A cheap request that passes the limiters but stops at Turnstile (no AI call).
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await call(chatRequest(q(), { ip }), e)).res.status);
    expect(statuses).toEqual([401, 401, 429]);
    const { res, text } = await call(chatRequest(q(), { ip: freshIp() }), e);
    expect(res.status).toBe(401);
    expect(text).toContain("turnstile_required");
    const again = await call(chatRequest(q(), { ip }), e);
    expect(JSON.parse(again.text).error).toBe("rate_limited");
    expect(Number(again.res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(again.res.headers.get("Retry-After"))).toBeLessThanOrEqual(600);
  });

  it("the Rate Limiting binding stops bursts (3 per 10 s)", async () => {
    mockFetch();
    const ip = freshIp();
    const { env: e } = env({ VISITOR_LIMIT: "100" }, []);
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await call(chatRequest(q(), { ip }), e)).res.status);
    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});

describe("input cap", () => {
  it("rejects questions over 500 characters before any work", async () => {
    const f = mockFetch();
    const { ai, env: e } = env();
    const { res, text } = await call(
      chatRequest({ ...q("x".repeat(501)), turnstileToken: "tok" }),
      e,
    );
    expect(res.status).toBe(413);
    expect(JSON.parse(text).error).toBe("too_long");
    expect(ai.calls).toHaveLength(0);
    expect(f.seen).toHaveLength(0);
    expect(
      (await call(chatRequest({ ...q("x".repeat(500)), turnstileToken: "tok" }), env().env)).res
        .status,
    ).toBe(200);
  });

  it("rejects bad bodies", async () => {
    mockFetch();
    for (const body of [
      "not json",
      { messages: [] },
      { messages: [{ role: "assistant", content: "hi" }] },
      { messages: [{ role: "system", content: "x" }] },
    ])
      expect((await call(chatRequest(body), env().env)).res.status).toBe(400);
    expect((await call(chatRequest("x".repeat(40_000)), env().env)).res.status).toBe(413);
  });
});

describe("daily cap", () => {
  it('switches to "back tomorrow" once the day\'s budget is used', async () => {
    mockFetch();
    const base = testEnv();
    const stub = base.QUOTA.get(base.QUOTA.idFromName(`daily:${saigonDay()}`));
    await runInDurableObject(stub, (_obj, state) => state.storage.deleteAll());
    const { ai, env: e } = env({ DAILY_MESSAGE_CAP: "1" }, [...happyScript(), ...happyScript()]);
    const first = await call(chatRequest({ ...q(), turnstileToken: "tok" }), e);
    expect(first.res.status).toBe(200);
    const second = await call(chatRequest({ ...q(), turnstileToken: "tok" }), e);
    expect(second.res.status).toBe(429);
    expect(JSON.parse(second.text)).toEqual({ error: "daily_limit", message: DAILY_LIMIT_MESSAGE });
    expect(ai.chatCalls()).toHaveLength(2);
  });
});

describe("CORS", () => {
  const preflight = (origin: string) =>
    new Request("https://chat.test/chat", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });

  it("answers preflight only for allowed origins", async () => {
    const ok = await call(preflight("http://localhost:4321"), env().env);
    expect(ok.res.status).toBe(204);
    expect(ok.res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4321");
    expect(ok.res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(ok.res.headers.get("Vary")).toBe("Origin");
    const bad = await call(preflight("https://evil.test"), env().env);
    expect(bad.res.status).toBe(403);
    expect(bad.res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("refuses /chat from other origins or with no origin", async () => {
    mockFetch();
    for (const origin of ["https://evil.test", "https://site.test.evil.test", null]) {
      const { res } = await call(
        chatRequest({ ...q(), turnstileToken: "tok" }, { origin }),
        env().env,
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("puts CORS headers on errors for allowed origins", async () => {
    mockFetch();
    const { res } = await call(chatRequest(q()), env().env);
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });
});

describe("GET /health and routing", () => {
  it("reports models, limits, tools and which secrets are set (never their values)", async () => {
    const { res, text } = await call(new Request("https://chat.test/health"), env().env);
    expect(res.status).toBe(200);
    const body = JSON.parse(text);
    expect(body).toMatchObject({
      ok: true,
      service: "portfo-chat",
      models: {
        chat: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        fallback: "@cf/meta/llama-3.1-8b-instruct",
        embeddings: "@cf/baai/bge-m3",
        dims: 1024,
      },
      limits: {
        inputChars: 500,
        maxTokens: 400,
        topK: 5,
        toolRounds: 3,
        perVisitorPer10Min: 10,
        dailyMessages: 50,
      },
      configured: { turnstile: true, session: true, ingest: true, siteUrl: true },
    });
    expect(body.tools).toHaveLength(7);
    expect(text).not.toContain("test-ingest-secret");
  });

  it("404s unknown paths and 405s wrong methods", async () => {
    expect((await call(new Request("https://chat.test/nope"), env().env)).res.status).toBe(404);
    expect(
      (await call(new Request("https://chat.test/health", { method: "POST" }), env().env)).res
        .status,
    ).toBe(405);
    expect(
      (await call(chatRequest(undefined as never, { method: "GET" }), env().env)).res.status,
    ).toBe(405);
    expect((await call(new Request("https://chat.test/ingest"), env().env)).res.status).toBe(405);
  });
});
