/**
 * Fixed-window rate limiting on the `rate_limits` table.
 *
 * Each hit upserts the counter for (key, window_start) in one statement, so
 * concurrent requests are counted exactly. Example keys:
 * `chat:<visitor_hash>` (10 per hour), `contact:<visitor_hash>` (3 per day).
 */
import { lt, sql } from "drizzle-orm";
import type { Db } from "./client";
import { rateLimits } from "./schema";

export interface RateLimitInput {
  key: string;
  /** Maximum hits allowed per window. */
  limit: number;
  windowMs: number;
  /** Clock override, for tests. */
  now?: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Hits in the current window, including this one. */
  count: number;
  remaining: number;
  /** When the current window ends. */
  resetAt: Date;
}

export function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/** Counts a hit for `key` and says whether it is within the limit. */
export async function hitRateLimit(db: Db, input: RateLimitInput): Promise<RateLimitResult> {
  if (input.limit < 1 || input.windowMs < 1) throw new Error("limit and windowMs must be >= 1");
  const start = windowStart(input.now ?? new Date(), input.windowMs);

  const [row] = await db
    .insert(rateLimits)
    .values({ key: input.key, windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  if (!row) throw new Error("hitRateLimit: upsert returned no row");

  return {
    allowed: row.count <= input.limit,
    count: row.count,
    remaining: Math.max(input.limit - row.count, 0),
    resetAt: new Date(start.getTime() + input.windowMs),
  };
}

/** Deletes counters whose window started before `before`. Run from a cron. */
export async function pruneRateLimits(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, before))
    .returning({ key: rateLimits.key });
  return rows.length;
}
