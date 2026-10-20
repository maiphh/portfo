import { describe, expect, it } from "vitest";
import { SseParser, toChatEvent, type SseMessage } from "./sse";

const feedAll = (chunks: string[]) => {
  const p = new SseParser();
  return chunks.flatMap((c) => p.feed(c));
};
const wire = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("SseParser", () => {
  it("parses the Worker's events in order", () => {
    const text =
      wire("session", { token: "t", expiresAt: 1 }) +
      wire("status", { tool: "get_cv", label: "Checking the CV…", round: 1 }) +
      wire("token", { text: "Hello " }) +
      wire("token", { text: "there." }) +
      wire("sources", { sources: [{ title: "Experience", href: "/#timeline" }] }) +
      wire("done", { rounds: 2, model: "m" });
    expect(feedAll([text]).map((m) => m.event)).toEqual([
      "session",
      "status",
      "token",
      "token",
      "sources",
      "done",
    ]);
  });

  it("handles events split at any byte boundary", () => {
    const text = wire("token", { text: "split across chunks" }) + wire("done", {});
    for (let i = 1; i < text.length; i++) {
      const out = feedAll([text.slice(0, i), text.slice(i)]);
      expect(out, `split at ${i}`).toEqual([
        { event: "token", data: '{"text":"split across chunks"}' },
        { event: "done", data: "{}" },
      ]);
    }
  });

  it("accepts CRLF and CR line endings, including a CRLF split across chunks", () => {
    expect(feedAll(["event: a\r\ndata: 1\r\n\r\n"])).toEqual([{ event: "a", data: "1" }]);
    expect(feedAll(["event: a\rdata: 1\r\r"])).toEqual([{ event: "a", data: "1" }]);
    expect(feedAll(["event: a\r", "\ndata: 1\r", "\n\r", "\n"])).toEqual([
      { event: "a", data: "1" },
    ]);
  });

  it("joins multi-line data, skips comments, defaults the event name", () => {
    expect(feedAll([": keep-alive\n\ndata: a\ndata: b\n\n"])).toEqual([
      { event: "message", data: "a\nb" },
    ]);
  });

  it("strips only one leading space and ignores unknown fields", () => {
    expect(feedAll(["id: 7\nretry: 100\nevent:x\ndata:  two\n\n"])).toEqual([
      { event: "x", data: " two" },
    ]);
  });

  it("drops an unterminated event at the end of the stream", () => {
    const p = new SseParser();
    expect(p.feed("event: token\ndata: {}")).toEqual([]);
    p.end();
    expect(p.feed("\n\n")).toEqual([]);
  });
});

describe("toChatEvent", () => {
  const m = (event: string, data: unknown): SseMessage => ({
    event,
    data: typeof data === "string" ? data : JSON.stringify(data),
  });

  it("validates each event type", () => {
    expect(toChatEvent(m("session", { token: "t", expiresAt: 5 }))).toEqual({
      type: "session",
      token: "t",
      expiresAt: 5,
    });
    expect(toChatEvent(m("status", { tool: "x", label: "Y…", round: 2 }))).toEqual({
      type: "status",
      tool: "x",
      label: "Y…",
      round: 2,
    });
    expect(toChatEvent(m("token", { text: "hi" }))).toEqual({ type: "token", text: "hi" });
    expect(toChatEvent(m("done", { rounds: 1, model: "m" }))).toEqual({
      type: "done",
      rounds: 1,
      model: "m",
    });
    expect(toChatEvent(m("error", { error: "upstream_error", message: "Down." }))).toEqual({
      type: "error",
      error: "upstream_error",
      message: "Down.",
    });
  });

  it("rejects malformed data and unknown events", () => {
    expect(toChatEvent(m("token", "not json"))).toBeNull();
    expect(toChatEvent(m("token", { text: 3 }))).toBeNull();
    expect(toChatEvent(m("session", { token: "t" }))).toBeNull();
    expect(toChatEvent(m("status", { label: "x" }))).toBeNull();
    expect(toChatEvent(m("ping", {}))).toBeNull();
    expect(toChatEvent(m("token", "null"))).toBeNull();
  });

  it("keeps only safe, unique source links", () => {
    const ev = toChatEvent(
      m("sources", {
        sources: [
          { title: "Case study", href: "/work/document-ocr" },
          { title: "Dup", href: "/work/document-ocr" },
          { title: "Script", href: "javascript:alert(1)" },
          { title: "Data", href: "data:text/html,hi" },
          { title: "GitHub", href: "https://github.com/maiphh" },
          { title: "", href: "/x" },
          { title: "No href" },
          "junk",
        ],
      }),
      "https://site.test",
    );
    expect(ev).toEqual({
      type: "sources",
      sources: [
        { title: "Case study", href: "/work/document-ocr" },
        { title: "GitHub", href: "https://github.com/maiphh" },
      ],
    });
  });

  it("turns same-origin absolute links into paths", () => {
    const ev = toChatEvent(
      m("sources", { sources: [{ title: "T", href: "https://site.test/#timeline" }] }),
      "https://site.test",
    );
    expect(ev).toEqual({ type: "sources", sources: [{ title: "T", href: "/#timeline" }] });
  });
});
