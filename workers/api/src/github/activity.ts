/**
 * GET /activity: turns synced tables into the GithubSummary the Activity section renders.
 */
import { addDays, daysBetween, saigonDate, weekday } from "./day";
import { SYNC_KIND } from "./sync";

export const HEATMAP_WEEKS = 52;
export const FEED_DAYS = 14;
export const FEED_MAX = 4;
export const REPOS_MAX = 6;

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface GithubFeedItem {
  kind: "commit" | "pr" | "issue" | "star";
  text: string;
  when: string;
}

export interface GithubRepoSummary {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  topics: string[];
  pushedAt: string | null;
}

export interface GithubSummary {
  publicRepos: number;
  commitsLastYear: number;
  streakDays: number;
  lastSyncedAt: string;
  heatmap: HeatLevel[];
  feed: GithubFeedItem[];
}

export type ActivityPayload =
  | { status: "ok"; summary: GithubSummary; repos: GithubRepoSummary[] }
  | { status: "empty"; summary: null; repos: []; reason: "never_synced" | "no_repos" }
  | { status: "unavailable"; summary: null; repos: [] };

export function level(count: number, max: number): HeatLevel {
  if (count <= 0 || max <= 0) return 0;
  const q = count / max;
  return q <= 0.25 ? 1 : q <= 0.5 ? 2 : q <= 0.75 ? 3 : 4;
}

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

interface RepoRow {
  repo_id: number;
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  topics: string;
  pushed_at: string | null;
}

interface ActivityRow {
  date: string;
  repo_id: number;
  commits: number;
  prs: number;
  issues: number;
}

export async function getActivity(
  db: D1Database,
  opts: { login: string; now?: Date },
): Promise<ActivityPayload> {
  const now = opts.now ?? new Date();
  const today = saigonDate(now);

  const lastRun = await db
    .prepare(
      `SELECT finished_at FROM sync_runs
       WHERE kind = ? AND status = 'success'
       ORDER BY finished_at DESC LIMIT 1`,
    )
    .bind(SYNC_KIND)
    .first<{ finished_at: string }>();
  if (!lastRun?.finished_at)
    return { status: "empty", summary: null, repos: [], reason: "never_synced" };

  const repoResult = await db
    .prepare(
      `SELECT repo_id, name, url, description, language, stars, topics, pushed_at
       FROM github_repos
       ORDER BY (pushed_at IS NULL), pushed_at DESC, name ASC`,
    )
    .all<RepoRow>();
  const repos = repoResult.results ?? [];
  if (!repos.length) return { status: "empty", summary: null, repos: [], reason: "no_repos" };
  const nameById = new Map(repos.map((r) => [r.repo_id, r.name]));

  const yearAgo = addDays(today, -364);
  const from = addDays(today, -(HEATMAP_WEEKS * 7 + 6));
  const actResult = await db
    .prepare(`SELECT date, repo_id, commits, prs, issues FROM github_activity WHERE date >= ?`)
    .bind(from)
    .all<ActivityRow>();
  const rows = actResult.results ?? [];

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
    .sort((a, b) => b.date.localeCompare(a.date) || b.commits - a.commits || a.repo_id - b.repo_id);
  for (const r of recent) {
    const repo = `${opts.login}/${nameById.get(r.repo_id) ?? "unknown"}`;
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
      lastSyncedAt: lastRun.finished_at,
      heatmap: heatmap(perDay, today),
      feed: feed.slice(0, FEED_MAX),
    },
    repos: repos.slice(0, REPOS_MAX).map((r) => ({
      name: r.name,
      url: r.url,
      description: r.description,
      language: r.language,
      stars: r.stars,
      topics: JSON.parse(r.topics || "[]") as string[],
      pushedAt: r.pushed_at,
    })),
  };
}

export const ACTIVITY_CACHE_CONTROL = "public, max-age=60";
