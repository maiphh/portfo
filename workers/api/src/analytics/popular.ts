/** GET /popular: most-read case studies over the last N days (1..30, default 7). */
import type { WorkRef } from "../work";

export const POPULAR_DAYS = 7;
export const POPULAR_MAX_DAYS = 30;
export const DAY_MS = 24 * 60 * 60_000;

export interface ViewCount {
  slug: string;
  title: string;
  href: string;
  views: number;
}

export interface PopularResult {
  items: ViewCount[];
  since: string;
  days: number;
}

export async function getPopular(
  db: D1Database,
  work: readonly WorkRef[],
  opts: { now?: Date; limit?: number; days?: number } = {},
): Promise<PopularResult> {
  const days = opts.days ?? POPULAR_DAYS;
  const since = new Date((opts.now ?? new Date()).getTime() - days * DAY_MS);
  const bySlug = new Map(work.map((w) => [w.slug, w]));
  if (!bySlug.size) return { items: [], since: since.toISOString(), days };

  const slugs = [...bySlug.keys()];
  const placeholders = slugs.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT slug, COUNT(*) AS views
       FROM page_views
       WHERE created_at >= ? AND slug IN (${placeholders})
       GROUP BY slug
       ORDER BY views DESC, slug ASC
       LIMIT ?`,
    )
    .bind(since.toISOString(), ...slugs, opts.limit ?? 6)
    .all<{ slug: string; views: number }>();

  const items = (rows.results ?? []).flatMap((r) => {
    const w = bySlug.get(r.slug);
    return w ? [{ ...w, views: Number(r.views) }] : [];
  });
  return { items, since: since.toISOString(), days };
}

export function parseDays(raw: string | null): number {
  if (!raw || !/^\d{1,2}$/.test(raw)) return POPULAR_DAYS;
  const n = Number(raw);
  return n >= 1 && n <= POPULAR_MAX_DAYS ? n : POPULAR_DAYS;
}

export const POPULAR_CACHE_CONTROL = "public, max-age=30";
