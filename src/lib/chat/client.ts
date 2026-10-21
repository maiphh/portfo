/** POST /chat on the portfo Worker and turn the SSE response into ChatEvents. */
import { errorCode, type ChatErrorCode } from "./errors";
import { SseParser, toChatEvent, type ChatEvent } from "./sse";

export const MAX_INPUT_CHARS = 500;
/** The Worker keeps the last 6 messages; sending more only costs bytes. */
export const MAX_HISTORY_MESSAGES = 6;

export interface WireMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: WireMessage[];
  sessionToken?: string;
}

export class ChatHttpError extends Error {
  constructor(
    readonly code: ChatErrorCode,
    readonly status = 0,
    readonly retryAfter: number | null = null,
    readonly serverMessage = "",
  ) {
    super(serverMessage || code);
    this.name = "ChatHttpError";
  }
}

export function chatEndpoint(base: string): string {
  return `${base.trim().replace(/\/+$/, "")}/chat`;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/**
 * Yields every event of one answer. Pre-stream failures (HTTP 4xx/5xx, offline) throw a
 * ChatHttpError; a stream that ends without `done` or `error` throws code "interrupted".
 * Aborts rethrow the AbortError untouched.
 */
export async function* streamChat(
  url: string,
  req: ChatRequest,
  opts: { signal?: AbortSignal; fetch?: typeof fetch; origin?: string } = {},
): AsyncGenerator<ChatEvent> {
  const f = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(req),
      signal: opts.signal,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ChatHttpError("network");
  }
  if (!res.ok) {
    let body: { error?: unknown; message?: unknown } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* not JSON */
    }
    const ra = Number(res.headers.get("Retry-After"));
    throw new ChatHttpError(
      errorCode(typeof body.error === "string" ? body.error : undefined, res.status),
      res.status,
      Number.isFinite(ra) && ra > 0 ? ra : null,
      typeof body.message === "string" ? body.message : "",
    );
  }
  if (!res.body) throw new ChatHttpError("network", res.status);

  const parser = new SseParser();
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let terminal = false;
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (isAbort(e) || opts.signal?.aborted) throw e;
        throw new ChatHttpError("interrupted", res.status);
      }
      const text = chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      for (const m of parser.feed(text)) {
        const ev = toChatEvent(m, opts.origin);
        if (!ev) continue;
        if (ev.type === "done" || ev.type === "error") terminal = true;
        yield ev;
        // `sources` follows `error`, so keep reading until the stream closes.
      }
      if (chunk.done) break;
    }
  } finally {
    parser.end();
    reader.releaseLock();
  }
  if (!terminal) throw new ChatHttpError("interrupted", res.status);
}
