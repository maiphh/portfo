/**
 * portfo: the portfolio's Cloudflare Worker.
 *   POST /chat               agent loop with read-only tools (SSE)
 *   POST /contact            store message + email via Resend
 *   POST /view               page-view beacon
 *   GET  /popular[?days=]    most-read case studies
 *   GET  /activity           GitHub summary
 *   POST /cron/github-sync   manual sync (Bearer CRON_SECRET)
 *   GET  /health             liveness and non-secret config
 * Cron Trigger every 6 hours runs the GitHub sync (no bearer needed).
 * CORS: ALLOWED_ORIGINS for browser calls; no Origin is allowed for cron/curl.
 */
import { getPopular, parseDays, POPULAR_CACHE_CONTROL } from "./analytics/popular";
import { readViewBody, recordView, viewResponse } from "./analytics/view";
import { handleChat } from "./chat";
import { MAX_INPUT_CHARS, config } from "./config";
import { BodyTooLargeError, clientIp, readBody } from "./contact/request";
import { toResponse, wantsJson } from "./contact/respond";
import { submitContact } from "./contact/submit";
import type { Env } from "./env";
import { consoleLogger as log } from "./env";
import { ACTIVITY_CACHE_CONTROL, getActivity } from "./github/activity";
import { handleGithubSync } from "./github/handler";
import { createGraphqlProvider } from "./github/provider";
import { runGithubSync } from "./github/sync";
import { corsHeaders, error, withHeaders } from "./http";
import { tools } from "./tools";
import { knownSlugs, workList } from "./work";

export { Quota } from "./quota";

function syncDeps(env: Env) {
  const cfg = config(env);
  return {
    db: env.DB,
    provider: env.GITHUB_TOKEN ? createGraphqlProvider({ token: env.GITHUB_TOKEN }) : null,
    log,
    login: cfg.login,
  };
}

async function handleContact(
  request: Request,
  env: Env,
  siteOrigin: string | null,
): Promise<Response> {
  const json = wantsJson(request);
  try {
    const raw = await readBody(request);
    const result = await submitContact(
      raw,
      {
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? "",
      },
      { db: env.DB, env, log },
    );
    return toResponse(result, json, siteOrigin);
  } catch (err) {
    if (err instanceof BodyTooLargeError)
      return toResponse({ kind: "too_large" }, json, siteOrigin);
    log.error("[contact] unexpected error", err);
    return toResponse({ kind: "error" }, json, siteOrigin);
  }
}

async function handleView(request: Request, env: Env): Promise<Response> {
  try {
    const body = await readViewBody(request);
    if (body === null) {
      return Response.json(
        { ok: false, error: "bad_body" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const result = await recordView(
      body,
      {
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent") ?? "",
      },
      { db: env.DB, env, log, knownSlugs },
    );
    return viewResponse(result);
  } catch (err) {
    log.error("[view] unexpected error", err);
    return Response.json(
      { ok: false, error: "error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const cfg = config(env);
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin, cfg);

  if (cors === false) {
    return error(403, "forbidden_origin", "Origin not allowed.");
  }
  const headers = cors;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headers ?? undefined });
  }

  switch (url.pathname) {
    case "/health":
      if (request.method !== "GET")
        return withHeaders(error(405, "method_not_allowed", "Use GET.", { Allow: "GET" }), headers);
      return withHeaders(
        Response.json(
          {
            ok: true,
            service: "portfo",
            models: {
              chat: cfg.chatModel,
              fallback: cfg.fallbackModel,
            },
            limits: {
              inputChars: MAX_INPUT_CHARS,
              maxTokens: cfg.maxTokens,
              toolRounds: cfg.maxToolRounds,
              perVisitorPer10Min: cfg.visitorLimit,
              dailyMessages: cfg.dailyCap,
            },
            tools: tools.map((t) => t.name),
            configured: {
              session: Boolean(env.SESSION_SIGNING_KEY),
              visitorSalt: Boolean(env.VISITOR_HASH_SALT),
              resend: Boolean(env.RESEND_API_KEY && env.NOTIFY_EMAIL),
              github: Boolean(env.GITHUB_TOKEN),
              cron: Boolean(env.CRON_SECRET),
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        ),
        headers,
      );

    case "/chat":
      // Browser chat always sends Origin; cron/curl without Origin are refused here.
      if (!headers) return error(403, "forbidden_origin", "Origin not allowed.");
      if (request.method !== "POST")
        return withHeaders(
          error(405, "method_not_allowed", "Use POST.", { Allow: "POST" }),
          headers,
        );
      return handleChat(request, env, ctx, cfg, headers);

    case "/contact":
      if (request.method !== "POST")
        return withHeaders(
          error(405, "method_not_allowed", "Use POST.", { Allow: "POST" }),
          headers,
        );
      return withHeaders(await handleContact(request, env, cfg.siteOrigin), headers);

    case "/view":
      if (request.method !== "POST")
        return withHeaders(
          error(405, "method_not_allowed", "Use POST.", { Allow: "POST" }),
          headers,
        );
      return withHeaders(await handleView(request, env), headers);

    case "/popular":
      if (request.method !== "GET")
        return withHeaders(error(405, "method_not_allowed", "Use GET.", { Allow: "GET" }), headers);
      try {
        const result = await getPopular(env.DB, workList, {
          days: parseDays(url.searchParams.get("days")),
        });
        return withHeaders(
          Response.json(result, { headers: { "Cache-Control": POPULAR_CACHE_CONTROL } }),
          headers,
        );
      } catch (err) {
        log.error("[popular] unavailable", err);
        return withHeaders(
          Response.json(
            { items: [], error: "unavailable" },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          ),
          headers,
        );
      }

    case "/activity":
      if (request.method !== "GET")
        return withHeaders(error(405, "method_not_allowed", "Use GET.", { Allow: "GET" }), headers);
      try {
        const payload = await getActivity(env.DB, { login: cfg.login });
        return withHeaders(
          Response.json(payload, { headers: { "Cache-Control": ACTIVITY_CACHE_CONTROL } }),
          headers,
        );
      } catch (err) {
        log.error("[activity] unavailable", err);
        return withHeaders(
          Response.json(
            { status: "unavailable", summary: null, repos: [] },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          ),
          headers,
        );
      }

    case "/cron/github-sync":
      if (request.method !== "POST")
        return withHeaders(
          error(405, "method_not_allowed", "Use POST.", { Allow: "POST" }),
          headers,
        );
      return withHeaders(await handleGithubSync(request, env, () => syncDeps(env)), headers);

    default:
      return withHeaders(error(404, "not_found", "Not found."), headers);
  }
}

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
  async scheduled(_controller, env) {
    const result = await runGithubSync(syncDeps(env));
    if (!result.ok) log.error("[cron] github sync failed", result);
    else log.info("[cron] github sync ok", result);
  },
} satisfies ExportedHandler<Env>;
