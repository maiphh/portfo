/**
 * POST /api/view core. One row per visitor_hash + slug + calendar day (Asia/Ho_Chi_Minh);
 * repeats the same day are quiet no-ops. No cookies and no raw IPs: only visitor_hash.
 */
import { z } from "astro/zod";
import type { Db } from "~/db/client";
import { hitRateLimit } from "~/db/rate-limit";
import { pageViews } from "~/db/schema";
import { ConfigError, type Env, type Logger } from "../env";
import { dailySalt, localDay, visitorHash } from "../visitor";

export const VIEW_LIMIT_PER_HOUR = 60;
export const HOUR_MS = 60 * 60_000;

/** Crawlers and link unfurlers: answered quietly, never stored. */
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^[a-z0-9.-]+$/);

export const viewSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  referrer_host: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    hostname.optional().catch(undefined),
  ),
});

export type ViewResult =
  | { kind: "recorded" }
  | { kind: "duplicate" }
  | { kind: "ignored"; reason: "bot" }
  | { kind: "invalid"; error: string }
  | { kind: "rate_limited" }
  | { kind: "unavailable"; reason: string };

export interface ViewDeps {
  db: Db;
  env: Env;
  log: Logger;
  /** Case-study slugs that may be counted. */
  knownSlugs: ReadonlySet<string>;
  now?: Date;
}

export async function recordView(
  raw: unknown,
  meta: { ip: string; userAgent: string },
  deps: ViewDeps,
): Promise<ViewResult> {
  const { db, env, log, knownSlugs } = deps;
  const now = deps.now ?? new Date();

  const parsed = viewSchema.safeParse(raw);
  if (!parsed.success) return { kind: "invalid", error: "bad_body" };
  const { slug, referrer_host } = parsed.data;
  if (!knownSlugs.has(slug)) return { kind: "invalid", error: "unknown_slug" };
  if (!meta.userAgent || BOT_UA.test(meta.userAgent)) return { kind: "ignored", reason: "bot" };

  let hash: string;
  try {
    hash = visitorHash(meta.ip, meta.userAgent, dailySalt(env, now, log));
  } catch (err) {
    if (err instanceof ConfigError) {
      log.error(`[view] ${err.message}`);
      return { kind: "unavailable", reason: "visitor_salt_not_configured" };
    }
    throw err;
  }

  const limit = await hitRateLimit(db, {
    key: `view:${hash}`,
    limit: VIEW_LIMIT_PER_HOUR,
    windowMs: HOUR_MS,
    now,
  });
  if (!limit.allowed) return { kind: "rate_limited" };

  const inserted = await db
    .insert(pageViews)
    .values({
      slug,
      visitorHash: hash,
      referrerHost: referrer_host ?? null,
      day: localDay(now),
      createdAt: now,
    })
    .onConflictDoNothing({ target: [pageViews.visitorHash, pageViews.slug, pageViews.day] })
    .returning({ id: pageViews.id });
  return inserted.length ? { kind: "recorded" } : { kind: "duplicate" };
}

export function viewResponse(result: ViewResult): Response {
  const headers = { "Cache-Control": "no-store" };
  switch (result.kind) {
    case "recorded":
      return new Response(null, { status: 204, headers });
    case "duplicate":
    case "ignored":
      // Quiet: nothing new was stored.
      return new Response(null, { status: 202, headers });
    case "invalid":
      return Response.json({ ok: false, error: result.error }, { status: 400, headers });
    case "rate_limited":
      return Response.json({ ok: false, error: "rate_limited" }, { status: 429, headers });
    case "unavailable":
      return Response.json({ ok: false, error: "unavailable" }, { status: 503, headers });
  }
}

export const MAX_VIEW_BODY_BYTES = 2048;

/** sendBeacon posts a Blob (often text/plain); fetch posts JSON. Accept both, and forms. */
export async function readViewBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_VIEW_BODY_BYTES) return null;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") && !text.trimStart().startsWith("{")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
