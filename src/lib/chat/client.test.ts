import { describe, expect, it } from "vitest";
import { ChatHttpError, chatEndpoint, streamChat } from "./client";
import { errorCode } from "./errors";
import { liveSession, loadChat, saveChat, STORAGE_KEY, wireMessages } from "./history";
import { keyboardInset, overlaps } from "./geometry";
import { safeHref } from "./href";
import { mockStream } from "./mock";
import type { ChatEvent } from "./sse";
import { tidy } from "./text";

const enc = new TextEncoder();
function sseResponse(chunks: string[], init: ResponseInit = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" }, ...init });
}
const wire = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
async function collect(gen: AsyncGenerator<ChatEvent>) {
  const out: ChatEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("streamChat", () => {
  it("POSTs the request and yields parsed events", async () => {
    let sent: RequestInit | undefined;
    const fetch = (async (_url: string, init?: RequestInit) => {
      sent = init;
      const text =
        wire("token", { text: "Hi" }) + wire("sources", { sources: [] }) + wire("done", {});
      // Split mid-event to exercise the streaming parser.
      return sseResponse([text.slice(0, 13), text.slice(13)]);
    }) as typeof globalThis.fetch;
    const events = await collect(
      streamChat("https://w.test/chat", { messages: [{ role: "user", content: "q" }] }, { fetch }),
    );
    expect(events.map((e) => e.type)).toEqual(["token", "sources", "done"]);
    expect(sent?.method).toBe("POST");
    expect(JSON.parse(String(sent?.body))).toEqual({ messages: [{ role: "user", content: "q" }] });
  });

  it("throws typed errors for JSON failures before the stream", async () => {
    const fetch = (async () =>
      Response.json(
        { error: "rate_limited", message: "Slow down." },
        { status: 429, headers: { "Retry-After": "420" } },
      )) as unknown as typeof globalThis.fetch;
    const err = await collect(streamChat("u", { messages: [] }, { fetch })).catch((e) => e);
    expect(err).toBeInstanceOf(ChatHttpError);
    expect(err).toMatchObject({ code: "rate_limited", status: 429, retryAfter: 420 });
  });

  it("maps offline and cut-off streams to network / interrupted", async () => {
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof globalThis.fetch;
    await expect(
      collect(streamChat("u", { messages: [] }, { fetch: offline })),
    ).rejects.toMatchObject({ code: "network" });
    const cut = (async () =>
      sseResponse([wire("token", { text: "half" })])) as typeof globalThis.fetch;
    await expect(collect(streamChat("u", { messages: [] }, { fetch: cut }))).rejects.toMatchObject({
      code: "interrupted",
    });
  });

  it("rethrows aborts untouched", async () => {
    const ac = new AbortController();
    ac.abort();
    const fetch = (async (_u: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return sseResponse([]);
    }) as typeof globalThis.fetch;
    await expect(
      collect(streamChat("u", { messages: [] }, { fetch, signal: ac.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("builds the endpoint and maps status codes", () => {
    expect(chatEndpoint("https://portfo.x.workers.dev/")).toBe("https://portfo.x.workers.dev/chat");
    expect(errorCode("daily_limit", 429)).toBe("daily_limit");
    expect(errorCode(undefined, 429)).toBe("rate_limited");
    expect(errorCode("weird", 502)).toBe("upstream_error");
  });
});

describe("mockStream", () => {
  it("emits the Worker's event shapes, ending with sources then done", async () => {
    const events = await collect(
      mockStream("How accurate is the OCR?", { speed: 0, newSession: true }),
    );
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("session");
    expect(types).toContain("status");
    expect(types.slice(-2)).toEqual(["sources", "done"]);
    const text = events.flatMap((e) => (e.type === "token" ? [e.text] : [])).join("");
    expect(text).toContain("vision-language model");
  });

  it("fails like the Worker for forced scenarios", async () => {
    await expect(
      collect(mockStream("q", { speed: 0, scenario: "rate_limited" })),
    ).rejects.toMatchObject({
      code: "rate_limited",
    });
    const up = await collect(mockStream("q", { speed: 0, scenario: "upstream" }));
    expect(up.map((e) => e.type).slice(-2)).toEqual(["error", "sources"]);
  });
});

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe("history (sessionStorage)", () => {
  it("round-trips messages and the session token", () => {
    const store = new MemoryStorage() as unknown as Storage;
    saveChat(
      {
        messages: [
          { role: "user", content: "q" },
          { role: "assistant", content: "a", sources: [{ title: "T", href: "/x" }] },
        ],
        session: { token: "t", expiresAt: 99 },
      },
      store,
    );
    expect(loadChat(store)).toEqual({
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: "a", sources: [{ title: "T", href: "/x" }] },
      ],
      session: { token: "t", expiresAt: 99 },
    });
  });

  it("survives junk and drops unsafe stored links", () => {
    const store = new MemoryStorage() as unknown as Storage;
    store.setItem(STORAGE_KEY, "{not json");
    expect(loadChat(store)).toEqual({ messages: [], session: null });
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({
        messages: [
          { role: "system", content: "x" },
          { role: "assistant", content: "a", sources: [{ title: "x", href: "javascript:1" }] },
        ],
      }),
    );
    expect(loadChat(store).messages).toEqual([{ role: "assistant", content: "a", sources: [] }]);
    expect(loadChat(null)).toEqual({ messages: [], session: null });
  });

  it("sends only good turns, newest six, ending with the question", () => {
    const h = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 ? "assistant" : "user") as "user" | "assistant",
      content: `m${i}`,
    }));
    h.push({ role: "assistant", content: "Couldn't reach it.", error: true } as never);
    const wire = wireMessages(h, "new");
    expect(wire).toHaveLength(6);
    expect(wire.at(-1)).toEqual({ role: "user", content: "new" });
    expect(wire.some((m) => m.content.includes("Couldn't"))).toBe(false);
  });

  it("treats a session as live only before its expiry (with slack)", () => {
    expect(liveSession({ token: "t", expiresAt: 100_000 }, 0)).toBe("t");
    expect(liveSession({ token: "t", expiresAt: 100_000 }, 80_000)).toBeUndefined();
    expect(liveSession(null)).toBeUndefined();
  });
});

describe("small helpers", () => {
  it("safeHref allows http(s) and relative links only", () => {
    expect(safeHref("/work/x", "https://s.test")).toBe("/work/x");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("  ")).toBeNull();
    expect(safeHref("mailto:a@b.c")).toBeNull();
  });

  it("tidy strips Markdown markers without adding markup", () => {
    expect(tidy("**Bold** and `code`\n* one\n- two\n## Head")).toBe(
      "Bold and code\n• one\n• two\nHead",
    );
    expect(tidy("<b>x</b>")).toBe("<b>x</b>");
  });

  it("keyboardInset reads the visual viewport", () => {
    expect(keyboardInset(800, { height: 800, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(800, { height: 460, offsetTop: 0 })).toBe(340);
    expect(keyboardInset(800, { height: 460, offsetTop: 40 })).toBe(300);
    expect(keyboardInset(800, null)).toBe(0);
  });

  it("overlaps detects boxes touching within the padding", () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(overlaps(a, { left: 5, top: 5, right: 20, bottom: 20 })).toBe(true);
    expect(overlaps(a, { left: 14, top: 0, right: 20, bottom: 10 })).toBe(false);
    expect(overlaps(a, { left: 14, top: 0, right: 20, bottom: 10 }, 6)).toBe(true);
  });
});
