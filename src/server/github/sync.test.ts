import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connect, memoryLogger, truncate } from "../../../test/db";
import { githubActivity, githubRepos, syncRuns } from "~/db/schema";
import { FakeGithubProvider, repo } from "./fake";
import { handleGithubSync } from "./handler";
import { GithubError, type ContributionData } from "./provider";
import { rollup, runGithubSync, windows, type SyncDeps } from "./sync";

const h = connect();
const db = h.db;
afterAll(() => h.close());
beforeEach(() => truncate(h, "github_activity", "github_repos", "sync_runs"));

// 10:00 on Mon 19 Oct 2026 in Saigon.
const now = new Date("2026-10-19T03:00:00Z");
const repos = [
  repo({
    repoId: 1,
    name: "portfo",
    stars: 3,
    topics: ["astro"],
    pushedAt: "2026-10-19T01:00:00Z",
  }),
  repo({ repoId: 2, name: "openportfo", language: "Python" }),
  repo({ repoId: 3, name: "someones-fork", isFork: true }),
  repo({ repoId: 4, name: "old-thing", isArchived: true }),
  repo({ repoId: 5, name: "secret", isPrivate: true }),
];
const contributions: ContributionData[] = [
  { repoId: 1, kind: "commit", occurredAt: "2026-10-18T17:00:00Z", count: 3 }, // 19 Oct Saigon
  { repoId: 1, kind: "pr", occurredAt: "2026-10-19T02:00:00Z", count: 1 },
  { repoId: 1, kind: "commit", occurredAt: "2026-10-17T17:00:00Z", count: 2 }, // 18 Oct
  { repoId: 2, kind: "commit", occurredAt: "2026-10-16T17:00:00Z", count: 5 }, // 17 Oct
  { repoId: 2, kind: "issue", occurredAt: "2026-10-17T02:00:00Z", count: 1 },
  { repoId: 3, kind: "commit", occurredAt: "2026-10-18T17:00:00Z", count: 9 }, // fork: dropped
  { repoId: 99, kind: "commit", occurredAt: "2026-10-18T17:00:00Z", count: 4 }, // not ours: dropped
];

const deps = (over: Partial<SyncDeps> = {}): SyncDeps => ({
  db,
  provider: new FakeGithubProvider(repos, contributions),
  log: memoryLogger(),
  login: "maiphh",
  now,
  ...over,
});

describe("windows", () => {
  it("covers the range in ≤ 91-day, non-overlapping chunks ending now", () => {
    const w = windows("2025-10-14", now).map(
      (x) => [Date.parse(x.from), Date.parse(x.to)] as const,
    );
    expect(w[0]?.[0]).toBe(Date.parse("2025-10-13T17:00:00.000Z"));
    expect(w.at(-1)?.[1]).toBe(now.getTime());
    w.forEach(([from, to], i) => {
      expect(to - from).toBeLessThan(91 * 864e5);
      if (i > 0) expect(from).toBe((w[i - 1]?.[1] ?? 0) + 1000);
    });
  });
});

describe("rollup", () => {
  it("sums per repo and Saigon day, keeping only stored repos", () => {
    const rows = rollup(contributions, new Set([1, 2]), "2026-01-01");
    expect(rows).toEqual([
      { date: "2026-10-17", repoId: 2, commits: 5, prs: 0, issues: 1 },
      { date: "2026-10-18", repoId: 1, commits: 2, prs: 0, issues: 0 },
      { date: "2026-10-19", repoId: 1, commits: 3, prs: 1, issues: 0 },
    ]);
  });
});

describe("runGithubSync", () => {
  it("stores public non-fork, non-archived repos and daily rollups, and logs the run", async () => {
    const r = await runGithubSync(deps());
    expect(r).toMatchObject({ ok: true, repos: 2, activityDays: 3, truncated: false });
    const stored = await db.select().from(githubRepos).orderBy(githubRepos.repoId);
    expect(stored.map((s) => s.name)).toEqual(["portfo", "openportfo"]);
    expect(stored[0]).toMatchObject({ stars: 3, topics: ["astro"], language: "TypeScript" });
    expect(stored[0]?.pushedAt?.toISOString()).toBe("2026-10-19T01:00:00.000Z");
    expect(await db.$count(githubActivity)).toBe(3);
    const [run] = await db.select().from(syncRuns);
    expect(run).toMatchObject({ kind: "github", status: "success", error: null });
    expect(run?.finishedAt).not.toBeNull();
  });

  it("is idempotent: a second run leaves the same rows", async () => {
    await runGithubSync(deps());
    const before = await db.select().from(githubActivity).orderBy(githubActivity.date);
    await runGithubSync(deps({ now: new Date(now.getTime() + 60_000) }));
    const after = await db.select().from(githubActivity).orderBy(githubActivity.date);
    expect(after).toEqual(before);
    expect(await db.$count(githubRepos)).toBe(2);
    expect(await db.$count(syncRuns)).toBe(2);
  });

  it("updates changed repos and drops ones that went away", async () => {
    await runGithubSync(deps());
    const changed = [
      repo({ repoId: 1, name: "portfo", stars: 10 }),
      repo({ repoId: 2, name: "openportfo", isArchived: true }),
    ];
    await runGithubSync(deps({ provider: new FakeGithubProvider(changed, contributions) }));
    const stored = await db.select().from(githubRepos);
    expect(stored.map((s) => [s.name, s.stars])).toEqual([["portfo", 10]]);
    // Activity for the dropped repo is gone too.
    expect((await db.select().from(githubActivity)).every((a) => a.repoId === 1)).toBe(true);
  });

  it("asks GitHub for at most ~91 days per contributions call", async () => {
    const provider = new FakeGithubProvider(repos, contributions);
    await runGithubSync(deps({ provider }));
    const calls = provider.calls.filter((c) => c.method === "listContributions");
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.every((c) => c.args[0] === "maiphh")).toBe(true);
  });

  it("fails the run cleanly without a token", async () => {
    const d = deps({ provider: null });
    const r = await runGithubSync(d);
    expect(r).toMatchObject({ ok: false, error: "github_token_missing" });
    const [run] = await db.select().from(syncRuns);
    expect(run).toMatchObject({ status: "failed", error: "GITHUB_TOKEN is not set" });
    expect(await db.$count(githubRepos)).toBe(0);
  });

  it("marks the run failed and keeps the previous snapshot when GitHub errors", async () => {
    await runGithubSync(deps());
    const provider = new FakeGithubProvider([], [], {
      fail: new GithubError("GitHub GraphQL HTTP 401"),
    });
    const r = await runGithubSync(deps({ provider, now: new Date(now.getTime() + 60_000) }));
    expect(r).toMatchObject({ ok: false, error: "sync_failed", detail: "GitHub GraphQL HTTP 401" });
    const runs = await db.select().from(syncRuns).orderBy(syncRuns.id);
    expect(runs.map((x) => x.status)).toEqual(["success", "failed"]);
    expect(await db.$count(githubRepos)).toBe(2);
  });

  it("does not start while another run is in progress", async () => {
    await db
      .insert(syncRuns)
      .values({ kind: "github", startedAt: new Date(now.getTime() - 60_000) });
    expect(await runGithubSync(deps())).toMatchObject({ ok: false, error: "already_running" });
    // A run stuck for over 10 minutes no longer blocks.
    const later = new Date(now.getTime() + 11 * 60_000);
    expect(await runGithubSync(deps({ now: later }))).toMatchObject({ ok: true });
  });
});

describe("handleGithubSync", () => {
  const req = (auth?: string) =>
    new Request("http://x/api/cron/github-sync", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    });
  const env = { CRON_SECRET: "s3cret" };

  it("503s when CRON_SECRET is unset", async () => {
    for (const e of [{}, { VERCEL_ENV: "production" }]) {
      expect((await handleGithubSync(req("Bearer x"), e, () => deps())).status).toBe(503);
    }
    expect(await db.$count(syncRuns)).toBe(0);
  });

  it("401s on a missing or wrong bearer token", async () => {
    expect((await handleGithubSync(req(), env, () => deps())).status).toBe(401);
    expect((await handleGithubSync(req("Bearer nope"), env, () => deps())).status).toBe(401);
    expect((await handleGithubSync(req("s3cret"), env, () => deps())).status).toBe(401);
    expect(await db.$count(syncRuns)).toBe(0);
  });

  it("runs the sync with the right token", async () => {
    const res = await handleGithubSync(req("Bearer s3cret"), env, () => deps());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, repos: 2 });
  });

  it("answers 503 with the run id when GITHUB_TOKEN is missing", async () => {
    const res = await handleGithubSync(req("Bearer s3cret"), env, () => deps({ provider: null }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: "github_token_missing" });
  });
});
