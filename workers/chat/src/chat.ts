/**
 * POST /chat: { messages: [{ role, content }], sessionToken? }
 * → text/event-stream with events:
 *   session  { token, expiresAt }       only when a new session was issued
 *   status   { tool, label, round }     one per tool call (the mascot's thinking state)
 *   token    { text }                   the answer, in pieces
 *   sources  { sources: [{ title, href }] }  always sent, last before done
 *   done     { rounds, model }
 *   error    { error, message }         if something failed mid-stream
 *
 * Guards, cheapest first: origin, size and shape, input cap, burst limit (binding),
 * visitor window (10 per 10 minutes), session token (issued when missing), daily budget.
 */
import { z } from "zod";
import { runAgent, type AgentEvent } from "./agent";
import {
  MAX_BODY_BYTES,
  MAX_HISTORY_CHARS,
  MAX_HISTORY_TURNS,
  MAX_INPUT_CHARS,
  VISITOR_WINDOW_MS,
  saigonDay,
  type Config,
} from "./config";
import type { Env } from "./env";
import { error, sha256Hex } from "./http";
import { DAILY_LIMIT_MESSAGE } from "./prompt";
import { issueSession, verifySession } from "./session";

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1)
    .max(20),
  sessionToken: z.string().max(512).optional(),
});

const enc = new TextEncoder();
const sse = (event: string, data: unknown) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function handleChat(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  cfg: Config,
  cors: Record<string, string>,
): Promise<Response> {
  const fail = (
    status: number,
    code: Parameters<typeof error>[1],
    msg: string,
    h: Record<string, string> = {},
  ) => error(status, code, msg, { ...cors, ...h });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, "too_long", "Request too large.");
  let body;
  try {
    body = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    return fail(400, "bad_request", "Body must be JSON.");
  }
  if (!body.success) return fail(400, "bad_request", "Expected { messages: [{ role, content }] }.");
  const last = body.data.messages.at(-1);
  if (!last || last.role !== "user" || !last.content.trim())
    return fail(400, "bad_request", "The last message must be a question.");
  if (last.content.length > MAX_INPUT_CHARS)
    return fail(413, "too_long", `Questions are limited to ${MAX_INPUT_CHARS} characters.`);

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!env.SESSION_SIGNING_KEY)
    return fail(503, "not_configured", "The chat is not configured yet.");
  const visitor = (await sha256Hex(`${env.SESSION_SIGNING_KEY}:${ip}`)).slice(0, 32);

  if (!(await env.CHAT_BURST_LIMITER.limit({ key: visitor })).success)
    return fail(429, "rate_limited", "Slow down a little and try again in a moment.", {
      "Retry-After": "10",
    });
  const bucket = String(Math.floor(Date.now() / VISITOR_WINDOW_MS));
  const v = await env.QUOTA.get(env.QUOTA.idFromName(`visitor:${visitor}`)).take(
    bucket,
    cfg.visitorLimit,
  );
  if (!v.ok)
    return fail(429, "rate_limited", "That's a lot of questions. Try again in a few minutes.", {
      "Retry-After": String(
        Math.ceil((VISITOR_WINDOW_MS - (Date.now() % VISITOR_WINDOW_MS)) / 1000),
      ),
    });

  let newSession: { token: string; expiresAt: number } | null = null;
  const session = await verifySession(env.SESSION_SIGNING_KEY, body.data.sessionToken);
  if (!session) {
    const issued = await issueSession(env.SESSION_SIGNING_KEY);
    newSession = { token: issued.token, expiresAt: issued.session.exp };
  }

  const day = saigonDay();
  const budget = await env.QUOTA.get(env.QUOTA.idFromName(`daily:${day}`)).take(day, cfg.dailyCap);
  if (!budget.ok) return fail(429, "daily_limit", DAILY_LIMIT_MESSAGE);

  const history = body.data.messages.slice(-MAX_HISTORY_TURNS).map((m) => ({
    role: m.role,
    content: m.content.slice(0, m.role === "user" ? MAX_INPUT_CHARS : MAX_HISTORY_CHARS),
  }));

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const write = (event: string, data: unknown) =>
    void writer.write(sse(event, data)).catch(() => {});

  const work = (async () => {
    if (newSession) write("session", newSession);
    try {
      const result = await runAgent({
        ai: env.AI,
        cfg,
        history,
        ctx: { env, cfg },
        emit: (e: AgentEvent) =>
          e.type === "status"
            ? write("status", { tool: e.tool, label: e.label, round: e.round })
            : write("token", { text: e.text }),
      });
      write("sources", { sources: result.sources });
      write("done", { rounds: result.rounds, model: result.model });
    } catch {
      write("error", {
        error: "upstream_error",
        message: "The assistant is unavailable right now. Try again soon.",
      });
      write("sources", { sources: [] });
    } finally {
      await writer.close().catch(() => {});
    }
  })();
  ctx.waitUntil(work);

  return new Response(readable, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
