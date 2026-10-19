/**
 * /api/activity core: turns the synced tables into the GithubSummary the Activity
 * section renders, plus a short list of recently pushed repos.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "~/db/client";
import { githubActivity, githubRepos, syncRuns } from "~/db/schema";
import type { GithubFeedItem, GithubRepoSummary, GithubSummary, HeatLevel } from "~/lib/types";
import { addDays, daysBetween, saigonDate, weekday } from "./day";
import { SYNC_KIND } from "./sync";

export const HEATMAP_WEEKS = 52;
export const FEED_DAYS = 14;
export const FEED_MAX = 4;
export const REPOS_MAX = 6;

export type ActivityPayload =
  | { status: "ok"; summary: GithubSummary; repos: GithubRepoSummary[] }
  | { status: "empty"; summary: null; repos: []; reason: "never_synced" | "no_repos" }
  | { status: "unavailable"; summary: null; repos: [] };

/** GitHub-style levels: 0 for none, else quartiles of the busiest day. */
export function level(count: number, max: number): HeatLevel {
  if (count <= 0 || max <= 0) return 0;
  const q = count / max;
  return q <= 0.25 ? 1 : q <= 0.5 ? 2 : q <= 0.75 ? 3 : 4;
}

/**
 * 52 columns of Sunday→Saturday weeks, the last column being the current week, so rows
 * line up with weekdays like on GitHub. Days after today are 0.
 */
export function heatmap(perDay: ReadonlyMap<string, number>, today: string): HeatLevel[] {
  const lastSunday = addDays(today, -weekday(today));
  const first = addDays(lastSunday, -7 * (HEATMAP_WEEKS - 1));
  const max = Math.max(0, ...perDay.values());
  const cells: HeatLevel[] = [];
  for (let i = 0; i < HEATMAP_WEEKS * 7; i++) {
    const d = addDays(first, i);
    cells.push(d > today ? 0 : level(perDay.get(d) ?? 0, max));
  }
  return cells;
}

/** Consecutive active days ending today, or yesterday if today has nothing yet. */
export function streak(perDay: ReadonlyMap<string, number>, today: string): number {
  let d = (perDay.get(today) ?? 0) > 0 ? today : addDays(today, -1);
  let n = 0;
  while ((perDay.get(d) ?? 0) > 0) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function whenLabel(date: string, today: string): string {
  const n = daysBetween(date, today);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function getActivity(
  db: Db,
  opts: { login: string; now?: Date },
): Promise<ActivityPayload> {
  const now = opts.now ?? new Date();
  const today = saigonDate(now);

  const [lastRun] = await db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, SYNC_KIND), eq(syncRuns.status, "success")))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);
  if (!lastRun?.finishedAt)
    return { status: "empty", summary: null, repos: [], reason: "never_synced" };

  const repos = await db
    .select()
    .from(githubRepos)
    .orderBy(sql`${githubRepos.pushedAt} desc nulls last`, githubRepos.name);
  if (!repos.length) return { status: "empty", summary: null, repos: [], reason: "no_repos" };
  const nameById = new Map(repos.map((r) => [r.repoId, r.name]));

  const yearAgo = addDays(today, -364);
  const rows = await db
    .select()
    .from(githubActivity)
    .where(gte(githubActivity.date, addDays(today, -(HEATMAP_WEEKS * 7 + 6))));

  const perDay = new Map<string, number>();
  let commitsLastYear = 0;
  for (const r of rows) {
    perDay.set(r.date, (perDay.get(r.date) ?? 0) + r.commits + r.prs + r.issues);
    if (r.date >= yearAgo && r.date <= today) commitsLastYear += r.commits;
  }

  const feedFrom = addDays(today, -(FEED_DAYS - 1));
  const feed: GithubFeedItem[] = [];
  const recent = rows
    .filter((r) => r.date >= feedFrom && r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.commits - a.commits || a.repoId - b.repoId);
  for (const r of recent) {
    const repo = `${opts.login}/${nameById.get(r.repoId) ?? "unknown"}`;
    const when = whenLabel(r.date, today);
    if (r.commits)
      feed.push({ kind: "commit", text: `${plural(r.commits, "commit")} to ${repo}`, when });
    if (r.prs) feed.push({ kind: "pr", text: `${plural(r.prs, "pull request")} in ${repo}`, when });
    if (r.issues)
      feed.push({ kind: "issue", text: `${plural(r.issues, "issue")} in ${repo}`, when });
    if (feed.length >= FEED_MAX) break;
  }

  return {
    status: "ok",
    summary: {
      publicRepos: repos.length,
      commitsLastYear,
      streakDays: streak(perDay, today),
      lastSyncedAt: lastRun.finishedAt.toISOString(),
      heatmap: heatmap(perDay, today),
      feed: feed.slice(0, FEED_MAX),
    },
    repos: repos.slice(0, REPOS_MAX).map((r) => ({
      name: r.name,
      url: r.url,
      description: r.description,
      language: r.language,
      stars: r.stars,
      topics: r.topics,
      pushedAt: r.pushedAt?.toISOString() ?? null,
    })),
  };
}

/** ~60 s at the edge; browsers revalidate. */
export const ACTIVITY_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=60";
