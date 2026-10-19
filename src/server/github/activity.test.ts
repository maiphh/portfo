import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connect, truncate } from "../../../test/db";
import { githubActivity, githubRepos, syncRuns } from "~/db/schema";
import { getActivity, heatmap, level, streak, whenLabel } from "./activity";

const h = connect();
const db = h.db;
afterAll(() => h.close());
beforeEach(() => truncate(h, "github_activity", "github_repos", "sync_runs"));

const now = new Date("2026-10-19T03:00:00Z"); // Mon 19 Oct, Saigon
const login = "maiphh";

async function seed() {
  await db
    .insert(syncRuns)
    .values({ kind: "github", status: "success", startedAt: now, finishedAt: now });
  await db.insert(githubRepos).values([
    {
      repoId: 1,
      name: "portfo",
      url: "https://github.com/maiphh/portfo",
      stars: 3,
      pushedAt: new Date("2026-10-19T01:00:00Z"),
    },
    {
      repoId: 2,
      name: "openportfo",
      url: "https://github.com/maiphh/openportfo",
      stars: 8,
      pushedAt: new Date("2026-09-01T00:00:00Z"),
    },
    { repoId: 3, name: "empty", url: "https://github.com/maiphh/empty", pushedAt: null },
  ]);
  await db.insert(githubActivity).values([
    { date: "2026-10-19", repoId: 1, commits: 3, prs: 1 },
    { date: "2026-10-18", repoId: 1, commits: 2 },
    { date: "2026-10-17", repoId: 2, commits: 5, issues: 1 },
    { date: "2026-10-15", repoId: 2, commits: 1 },
    { date: "2025-10-01", repoId: 2, commits: 40 }, // older than a year: not counted
  ]);
}

describe("helpers", () => {
  it("levels by quartile of the busiest day", () => {
    expect([0, 1, 2, 3, 4, 8].map((c) => level(c, 8))).toEqual([0, 1, 1, 2, 2, 4]);
  });
  it("builds 52 Sunday-first weeks ending this week, future days empty", () => {
    const cells = heatmap(
      new Map([
        ["2026-10-19", 4],
        ["2026-10-18", 2],
      ]),
      "2026-10-19",
    );
    expect(cells).toHaveLength(364);
    // Last column: Sun 18 (index 357), Mon 19 (358), Tue–Sat future.
    expect(cells.slice(357)).toEqual([2, 4, 0, 0, 0, 0, 0]);
  });
  it("counts the streak back from today, or from yesterday", () => {
    const m = new Map([
      ["2026-10-19", 1],
      ["2026-10-18", 1],
      ["2026-10-16", 1],
    ]);
    expect(streak(m, "2026-10-19")).toBe(2);
    expect(streak(m, "2026-10-20")).toBe(2);
    expect(streak(m, "2026-10-21")).toBe(0);
  });
  it("labels days relative to today", () => {
    expect(
      ["2026-10-19", "2026-10-18", "2026-10-15"].map((d) => whenLabel(d, "2026-10-19")),
    ).toEqual(["today", "yesterday", "4 days ago"]);
  });
});

describe("getActivity", () => {
  it("is empty (no fake numbers) before the first successful sync", async () => {
    expect(await getActivity(db, { login, now })).toEqual({
      status: "empty",
      summary: null,
      repos: [],
      reason: "never_synced",
    });
    await db
      .insert(syncRuns)
      .values({ kind: "github", status: "failed", startedAt: now, finishedAt: now });
    expect((await getActivity(db, { login, now })).status).toBe("empty");
  });

  it("returns the GithubSummary shape the Activity section renders", async () => {
    await seed();
    const a = await getActivity(db, { login, now });
    expect(a.status).toBe("ok");
    if (a.status !== "ok") return;
    expect(a.summary).toMatchObject({
      publicRepos: 3,
      commitsLastYear: 11,
      streakDays: 3,
      lastSyncedAt: now.toISOString(),
    });
    expect(a.summary.heatmap).toHaveLength(364);
    expect(a.summary.feed).toEqual([
      { kind: "commit", text: "3 commits to maiphh/portfo", when: "today" },
      { kind: "pr", text: "1 pull request in maiphh/portfo", when: "today" },
      { kind: "commit", text: "2 commits to maiphh/portfo", when: "yesterday" },
      { kind: "commit", text: "5 commits to maiphh/openportfo", when: "2 days ago" },
    ]);
    // Recently pushed first, never-pushed last.
    expect(a.repos.map((r) => r.name)).toEqual(["portfo", "openportfo", "empty"]);
    expect(a.repos[0]).toMatchObject({
      stars: 3,
      pushedAt: "2026-10-19T01:00:00.000Z",
      topics: [],
    });
  });
});
