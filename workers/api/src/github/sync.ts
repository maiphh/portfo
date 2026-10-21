/**
 * GitHub sync: pulls public repos + a year of contributions, replaces the D1 snapshot.
 *
 * Live `github_activity` is only replaced in one atomic `db.batch` (swap from
 * `github_activity_next`). Staging fills and repo upserts may use multiple batches;
 * a failure while filling staging leaves the previous live activity intact.
 */
import type { Logger } from "../env";
import { addDays, saigonDate, saigonMidnight } from "./day";
import type { ContributionData, GithubProvider, RepoData } from "./provider";

export const SYNC_KIND = "github";
export const SYNC_DAYS = 371;
const CHUNK_DAYS = 91;
export const RUN_LOCK_MS = 10 * 60_000;

/** D1 allows at most 100 bound parameters per query; 15 rows × 5 cols = 75. */
const ACTIVITY_INSERT_ROWS = 15;
/** D1 batch allows at most 100 statements per call. */
const BATCH_STMTS = 90;

export interface SyncDeps {
  db: D1Database;
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

async function batchAll(db: D1Database, stmts: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < stmts.length; i += BATCH_STMTS) {
    await db.batch(stmts.slice(i, i + BATCH_STMTS));
  }
}

function repoUpsert(db: D1Database, r: RepoData): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO github_repos (repo_id, name, url, description, language, stars, topics, pushed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (repo_id) DO UPDATE SET
         name = excluded.name,
         url = excluded.url,
         description = excluded.description,
         language = excluded.language,
         stars = excluded.stars,
         topics = excluded.topics,
         pushed_at = excluded.pushed_at`,
    )
    .bind(
      r.repoId,
      r.name,
      r.url,
      r.description,
      r.language,
      r.stars,
      JSON.stringify(r.topics.slice(0, 10)),
      r.pushedAt,
    );
}

/** Multi-row INSERT into github_activity_next (≤ ACTIVITY_INSERT_ROWS per statement). */
function stagingInserts(db: D1Database, rows: Rollup[]): D1PreparedStatement[] {
  const out: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += ACTIVITY_INSERT_ROWS) {
    const chunk = rows.slice(i, i + ACTIVITY_INSERT_ROWS);
    const values = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const binds: unknown[] = [];
    for (const row of chunk) {
      binds.push(row.date, row.repoId, row.commits, row.prs, row.issues);
    }
    out.push(
      db
        .prepare(
          `INSERT INTO github_activity_next (date, repo_id, commits, prs, issues) VALUES ${values}`,
        )
        .bind(...binds),
    );
  }
  return out;
}

export async function runGithubSync(deps: SyncDeps): Promise<SyncResult> {
  const { db, provider, log, login } = deps;
  const now = deps.now ?? new Date();
  const nowIso = now.toISOString();
  const lockAfter = new Date(now.getTime() - RUN_LOCK_MS).toISOString();

  const busy = await db
    .prepare(
      `SELECT id FROM sync_runs
       WHERE kind = ? AND status = 'running' AND started_at > ?
       ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(SYNC_KIND, lockAfter)
    .first<{ id: number }>();
  if (busy) return { ok: false, runId: busy.id, error: "already_running" };

  const run = await db
    .prepare(
      `INSERT INTO sync_runs (kind, started_at, status) VALUES (?, ?, 'running') RETURNING id`,
    )
    .bind(SYNC_KIND, nowIso)
    .first<{ id: number }>();
  if (!run) throw new Error("sync_runs insert returned no row");
  const runId = run.id;

  const finish = async (status: "success" | "failed", error: string | null = null) => {
    await db
      .prepare(`UPDATE sync_runs SET status = ?, error = ?, finished_at = ? WHERE id = ?`)
      .bind(status, error, (deps.now ?? new Date()).toISOString(), runId)
      .run();
  };

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

    // 1. Upsert repos (may leave extras if we fail later; acceptable).
    await batchAll(
      db,
      repos.map((r) => repoUpsert(db, r)),
    );

    // 2. Fill staging. Failure here must not touch live github_activity.
    await db.prepare(`DELETE FROM github_activity_next`).run();
    await batchAll(db, stagingInserts(db, rows));

    // 3. One atomic swap: replace live activity, clear staging, drop missing repos.
    const swap: D1PreparedStatement[] = [
      db.prepare(`DELETE FROM github_activity`),
      db.prepare(
        `INSERT INTO github_activity (date, repo_id, commits, prs, issues)
         SELECT date, repo_id, commits, prs, issues FROM github_activity_next`,
      ),
      db.prepare(`DELETE FROM github_activity_next`),
    ];
    if (repoIds.size) {
      const ids = [...repoIds];
      const ph = ids.map(() => "?").join(",");
      swap.push(db.prepare(`DELETE FROM github_repos WHERE repo_id NOT IN (${ph})`).bind(...ids));
    } else {
      swap.push(db.prepare(`DELETE FROM github_repos`));
    }
    await db.batch(swap);

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
