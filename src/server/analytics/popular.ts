/** GET /api/popular core: most-read case studies over the last 7 days (or `days`, 1 to 30). */
import { and, count, desc, gte, inArray, asc } from "drizzle-orm";
import type { Db } from "~/db/client";
import { pageViews } from "~/db/schema";
import type { ViewCount } from "~/lib/types";

export const POPULAR_DAYS = 7;
export const POPULAR_MAX_DAYS = 30;
export const DAY_MS = 24 * 60 * 60_000;

export interface WorkRef {
  slug: string;
  title: string;
  href: string;
}

export interface PopularResult {
  items: ViewCount[];
  since: string;
  days: number;
}

/**
 * Counts deduped views (one per visitor per page per day) since now − `days` (default 7), highest first,
 * ties by slug. Only known case studies are returned, with their title and home anchor.
 */
export async function getPopular(
  db: Db,
  work: readonly WorkRef[],
  opts: { now?: Date; limit?: number; days?: number } = {},
): Promise<PopularResult> {
  const days = opts.days ?? POPULAR_DAYS;
  const since = new Date((opts.now ?? new Date()).getTime() - days * DAY_MS);
  const bySlug = new Map(work.map((w) => [w.slug, w]));
  if (!bySlug.size) return { items: [], since: since.toISOString(), days };

  const views = count();
  const rows = await db
    .select({ slug: pageViews.slug, views })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, since), inArray(pageViews.slug, [...bySlug.keys()])))
    .groupBy(pageViews.slug)
    .orderBy(desc(views), asc(pageViews.slug))
    .limit(opts.limit ?? 6);

  const items = rows.flatMap((r) => {
    const w = bySlug.get(r.slug);
    return w ? [{ ...w, views: Number(r.views) }] : [];
  });
  return { items, since: since.toISOString(), days };
}

/** `?days=` from the query string: an integer 1 to 30, else the 7-day default. */
export function parseDays(raw: string | null): number {
  if (!raw || !/^\d{1,2}$/.test(raw)) return POPULAR_DAYS;
  const n = Number(raw);
  return n >= 1 && n <= POPULAR_MAX_DAYS ? n : POPULAR_DAYS;
}

/** ~30 s at the edge (Vercel honours s-maxage), browsers revalidate. */
export const POPULAR_CACHE_CONTROL = "public, max-age=0, s-maxage=30, stale-while-revalidate=30";
