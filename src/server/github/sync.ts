/**
 * GitHub sync: pulls the owner's public repos and a year of public contributions,
 * replaces the stored snapshot in one transaction, and logs the run to sync_runs.
 *
 * Stored: only the owner's public, non-fork, non-archived repos (the Activity UI shows
 * the owner's own current work), and daily commit / PR / issue counts for those repos.
 * Contributions to other people's repos and anything private are dropped.
 */
import { and, desc, eq, gt, notInArray } from "drizzle-orm";
import type { Db } from "~/db/client";
import { githubActivity, githubRepos, syncRuns } from "~/db/schema";
import type { Logger } from "../env";
import { addDays, saigonDate, saigonMidnight } from "./day";
import type { ContributionData, GithubProvider, RepoData } from "./provider";

export const SYNC_KIND = "github";
/** Days of history kept (52 weeks plus the current week). */
export const SYNC_DAYS = 371;
/** GitHub's contributionsCollection pages at 100 per repo; ≤ 91 days keeps daily commit rollups in one page. */
const CHUNK_DAYS = 91;
/** A run still `running` after this long is considered dead and no longer blocks a new one. */
export const RUN_LOCK_MS = 10 * 60_000;

export interface SyncDeps {
  db: Db;
  /** null when GITHUB_TOKEN isn't set. */
  provider: GithubProvider | null;
  log: Logger;
  login: string;
  now?: Date;
}

export type SyncResult =
  | {
      ok: true;
      runId: number;
      repos: number;
      activityDays: number;
      truncated: boolean;
    }
  | {
      ok: false;
      runId: number | null;
      error: "github_token_missing" | "already_running" | "sync_failed";
      detail?: string;
    };

export function keepRepo(r: RepoData): boolean {
  return !r.isFork && !r.isArchived && !r.isPrivate;
}

interface Rollup {
  date: string;
  repoId: number;
  commits: number;
  prs: number;
  issues: number;
}

export function rollup(
  contributions: ContributionData[],
  repoIds: ReadonlySet<number>,
  since: string,
): Rollup[] {
  const byKey = new Map<string, Rollup>();
  for (const c of contributions) {
    if (!repoIds.has(c.repoId)) continue;
    const date = saigonDate(c.occurredAt);
    if (date < since) continue;
    const key = `${c.repoId}|${date}`;
    const row = byKey.get(key) ?? { date, repoId: c.repoId, commits: 0, prs: 0, issues: 0 };
    if (c.kind === "commit") row.commits += c.count;
    else if (c.kind === "pr") row.prs += c.count;
    else row.issues += c.count;
    byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.repoId - b.repoId);
}

/** Splits [since, now] into windows GitHub accepts, without overlap. */
export function windows(since: string, now: Date): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (
    let start = since;
    Date.parse(saigonMidnight(start)) < now.getTime();
    start = addDays(start, CHUNK_DAYS)
  ) {
    const nextStart = Date.parse(saigonMidnight(addDays(start, CHUNK_DAYS)));
    const to = Math.min(nextStart - 1000, now.getTime());
    out.push({ from: saigonMidnight(start), to: new Date(to).toISOString() });
  }
  return out;
}

const errorText = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).slice(0, 500);

export async function runGithubSync(deps: SyncDeps): Promise<SyncResult> {
  const { db, provider, log, login } = deps;
  const now = deps.now ?? new Date();

  const [busy] = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.kind, SYNC_KIND),
        eq(syncRuns.status, "running"),
        gt(syncRuns.startedAt, new Date(now.getTime() - RUN_LOCK_MS)),
      ),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  if (busy) return { ok: false, runId: busy.id, error: "already_running" };

  const [run] = await db
    .insert(syncRuns)
    .values({ kind: SYNC_KIND, startedAt: now, status: "running" })
    .returning({ id: syncRuns.id });
  if (!run) throw new Error("sync_runs insert returned no row");
  const runId = run.id;
  const finish = (status: "success" | "failed", error: string | null = null) =>
    db
      .update(syncRuns)
      .set({ status, error, finishedAt: deps.now ?? new Date() })
      .where(eq(syncRuns.id, runId));

  if (!provider) {
    log.warn("[github-sync] GITHUB_TOKEN is not set; run marked failed");
    await finish("failed", "GITHUB_TOKEN is not set");
    return { ok: false, runId, error: "github_token_missing" };
  }

  try {
    const since = addDays(saigonDate(now), -(SYNC_DAYS - 1));
    const repos = (await provider.listRepos(login)).filter(keepRepo);
    const repoIds = new Set(repos.map((r) => r.repoId));

    const contributions: ContributionData[] = [];
    let truncated = false;
    for (const w of windows(since, now)) {
      const page = await provider.listContributions(login, w.from, w.to);
      contributions.push(...page.contributions);
      truncated ||= page.truncated;
    }
    if (truncated) log.warn("[github-sync] some contribution lists were longer than one page");
    const rows = rollup(contributions, repoIds, since);

    await db.transaction(async (tx) => {
      for (const r of repos) {
        const values = {
          name: r.name,
          url: r.url,
          description: r.description,
          language: r.language,
          stars: r.stars,
          topics: r.topics.slice(0, 10),
          pushedAt: r.pushedAt ? new Date(r.pushedAt) : null,
        };
        await tx
          .insert(githubRepos)
          .values({ repoId: r.repoId, ...values })
          .onConflictDoUpdate({ target: githubRepos.repoId, set: values });
      }
      // Repos that became forks, archived, private or were deleted drop out (activity cascades).
      if (repoIds.size)
        await tx.delete(githubRepos).where(notInArray(githubRepos.repoId, [...repoIds]));
      else await tx.delete(githubRepos);
      // Replace the whole rollup so counts match GitHub exactly on every run (older days
      // fall out of the window; nothing beyond 53 weeks is shown).
      await tx.delete(githubActivity);
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(githubActivity).values(rows.slice(i, i + 500));
      }
    });

    await finish("success");
    log.info(`[github-sync] run ${runId}: ${repos.length} repos, ${rows.length} repo-days`);
    return { ok: true, runId, repos: repos.length, activityDays: rows.length, truncated };
  } catch (err) {
    const detail = errorText(err);
    log.error(`[github-sync] run ${runId} failed: ${detail}`);
    await finish("failed", detail);
    return { ok: false, runId, error: "sync_failed", detail };
  }
}
