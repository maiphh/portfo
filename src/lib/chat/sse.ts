/**
 * Incremental parser for the portfo-chat Worker's text/event-stream, plus typed events.
 * Follows the EventSource rules that matter here: `event:`/`data:` fields, multi-line data,
 * comments, any of CRLF/LF/CR as line endings, and lines split across network chunks.
 */
import { safeHref } from "./href";

export interface SseMessage {
  event: string;
  data: string;
}

export class SseParser {
  private buf = "";
  private event = "";
  private data: string[] = [];
  private skipLf = false;

  /** Feeds one decoded chunk and returns every message it completed. */
  feed(chunk: string): SseMessage[] {
    // A CRLF split across chunks: the CR ended the line, so drop the LF.
    if (this.skipLf && chunk.startsWith("\n")) chunk = chunk.slice(1);
    this.skipLf = chunk.endsWith("\r");
    this.buf += chunk;
    const lines = this.buf.split(/\r\n|\r|\n/);
    this.buf = lines.pop() ?? "";
    const out: SseMessage[] = [];
    for (const line of lines) {
      const msg = this.line(line);
      if (msg) out.push(msg);
    }
    return out;
  }

  /** End of stream. Per the spec an unterminated event is dropped. */
  end(): void {
    this.buf = "";
    this.event = "";
    this.data = [];
    this.skipLf = false;
  }

  private line(line: string): SseMessage | null {
    if (line === "") {
      if (this.data.length === 0) {
        this.event = "";
        return null;
      }
      const msg = { event: this.event || "message", data: this.data.join("\n") };
      this.event = "";
      this.data = [];
      return msg;
    }
    if (line.startsWith(":")) return null;
    const i = line.indexOf(":");
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? "" : line.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.event = value;
    else if (field === "data") this.data.push(value);
    return null;
  }
}

export interface Source {
  title: string;
  href: string;
}

export type ChatEvent =
  | { type: "session"; token: string; expiresAt: number }
  | { type: "status"; tool: string; label: string; round?: number }
  | { type: "token"; text: string }
  | { type: "sources"; sources: Source[] }
  | { type: "done"; rounds?: number; model?: string }
  | { type: "error"; error: string; message: string };

const str = (v: unknown): v is string => typeof v === "string";
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validates one SSE message into a ChatEvent; anything malformed or unknown is null. */
export function toChatEvent(m: SseMessage, origin?: string): ChatEvent | null {
  let d: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(m.data);
    if (!parsed || typeof parsed !== "object") return null;
    d = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (m.event) {
    case "session":
      return str(d.token) && num(d.expiresAt)
        ? { type: "session", token: d.token, expiresAt: d.expiresAt }
        : null;
    case "status":
      return str(d.tool) && str(d.label)
        ? { type: "status", tool: d.tool, label: d.label, ...(num(d.round) && { round: d.round }) }
        : null;
    case "token":
      return str(d.text) ? { type: "token", text: d.text } : null;
    case "sources": {
      if (!Array.isArray(d.sources)) return null;
      const seen = new Set<string>();
      const sources: Source[] = [];
      for (const s of d.sources as unknown[]) {
        if (!s || typeof s !== "object") continue;
        const { title, href } = s as Record<string, unknown>;
        if (!str(title) || !str(href) || !title.trim()) continue;
        const safe = safeHref(href, origin);
        if (!safe || seen.has(safe)) continue;
        seen.add(safe);
        sources.push({ title: title.trim().slice(0, 120), href: safe });
      }
      return { type: "sources", sources: sources.slice(0, 6) };
    }
    case "done":
      return {
        type: "done",
        ...(num(d.rounds) && { rounds: d.rounds }),
        ...(str(d.model) && { model: d.model }),
      };
    case "error":
      return {
        type: "error",
        error: str(d.error) ? d.error : "upstream_error",
        message: str(d.message) ? d.message : "",
      };
    default:
      return null;
  }
}
