/**
 * portfo-chat: the portfolio's chat Worker.
 *   POST /chat    agent loop with read-only tools over the CV, case studies and site APIs (SSE)
 *   POST /ingest  chunk + embed + upsert the corpus into Vectorize (Bearer INGEST_SECRET)
 *   GET  /health  liveness and non-secret config
 * CORS: only ALLOWED_ORIGINS, and /chat refuses any other origin.
 */
import { handleChat } from "./chat";
import { EMBED_DIMS, EMBED_MODEL, MAX_INPUT_CHARS, TOP_K, config } from "./config";
import type { Env } from "./env";
import { corsHeaders, error, withHeaders } from "./http";
import { handleIngest } from "./ingest";
import { tools } from "./tools";

export { Quota } from "./quota";

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const cfg = config(env);
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin, cfg);

  if (request.method === "OPTIONS") {
    if (!cors) return error(403, "forbidden_origin", "Origin not allowed.");
    return new Response(null, { status: 204, headers: cors });
  }

  switch (url.pathname) {
    case "/health":
      if (request.method !== "GET")
        return error(405, "method_not_allowed", "Use GET.", { Allow: "GET" });
      return withHeaders(
        Response.json(
          {
            ok: true,
            service: "portfo-chat",
            models: {
              chat: cfg.chatModel,
              fallback: cfg.fallbackModel,
              embeddings: EMBED_MODEL,
              dims: EMBED_DIMS,
            },
            limits: {
              inputChars: MAX_INPUT_CHARS,
              maxTokens: cfg.maxTokens,
              topK: TOP_K,
              toolRounds: cfg.maxToolRounds,
              perVisitorPer10Min: cfg.visitorLimit,
              dailyMessages: cfg.dailyCap,
            },
            tools: tools.map((t) => t.name),
            configured: {
              turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
              session: Boolean(env.SESSION_SIGNING_KEY),
              ingest: Boolean(env.INGEST_SECRET),
              siteUrl: Boolean(cfg.siteUrl),
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        ),
        cors,
      );
    case "/chat":
      if (!cors) return error(403, "forbidden_origin", "Origin not allowed.");
      if (request.method !== "POST")
        return error(405, "method_not_allowed", "Use POST.", { ...cors, Allow: "POST" });
      return handleChat(request, env, ctx, cfg, cors);
    case "/ingest":
      if (request.method !== "POST")
        return error(405, "method_not_allowed", "Use POST.", { Allow: "POST" });
      return handleIngest(request, env);
    default:
      return withHeaders(error(404, "not_found", "Not found."), cors);
  }
}

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
} satisfies ExportedHandler<Env>;
