import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeGithubProvider, repo } from "../src/github/fake";
import { runGithubSync } from "../src/github/sync";
import { env } from "./env";
import { call, ORIGIN, testEnv } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("github sync", () => {
  it("replaces the snapshot with the provider's public non-fork repos", async () => {
    const provider = new FakeGithubProvider(
      [
        repo({ repoId: 1, name: "portfo", stars: 3, topics: ["astro"] }),
        repo({ repoId: 2, name: "forked", isFork: true }),
        repo({ repoId: 3, name: "old", isArchived: true }),
      ],
      [
        {
          repoId: 1,
          kind: "commit",
          occurredAt: new Date().toISOString(),
          count: 2,
        },
      ],
    );
    const result = await runGithubSync({
      db: env.DB,
      provider,
      log: console,
      login: "maiphh",
    });
    expect(result).toMatchObject({ ok: true, repos: 1 });
    const repos = await env.DB.prepare("SELECT name, stars, topics FROM github_repos").all();
    expect(repos.results).toHaveLength(1);
    expect(repos.results?.[0]).toMatchObject({ name: "portfo", stars: 3 });
    expect(JSON.parse(String(repos.results?.[0]?.topics))).toEqual(["astro"]);

    // Second sync with a different set replaces, not appends.
    const provider2 = new FakeGithubProvider([repo({ repoId: 9, name: "poet", stars: 1 })]);
    const result2 = await runGithubSync({
      db: env.DB,
      provider: provider2,
      log: console,
      login: "maiphh",
    });
    expect(result2).toMatchObject({ ok: true, repos: 1 });
    const after = await env.DB.prepare("SELECT name FROM github_repos").all();
    expect(after.results?.map((r) => String(r.name))).toEqual(["poet"]);
  });

  it("returns already_running when a run is still open", async () => {
    await env.DB.prepare(
      `INSERT INTO sync_runs (kind, started_at, status) VALUES ('github', ?, 'running')`,
    )
      .bind(new Date().toISOString())
      .run();
    const result = await runGithubSync({
      db: env.DB,
      provider: new FakeGithubProvider(),
      log: console,
      login: "maiphh",
    });
    expect(result).toMatchObject({ ok: false, error: "already_running" });
  });

  it("records a failed run and returns github_token_missing when provider is null", async () => {
    const result = await runGithubSync({
      db: env.DB,
      provider: null,
      log: console,
      login: "maiphh",
    });
    expect(result).toMatchObject({ ok: false, error: "github_token_missing" });
    const run = await env.DB.prepare("SELECT status, error FROM sync_runs").first();
    expect(run).toMatchObject({ status: "failed", error: "GITHUB_TOKEN is not set" });
  });

  it("swaps 120+ activity rows atomically and a second sync replaces them", async () => {
    const dayMs = 86_400_000;
    const many = Array.from({ length: 120 }, (_, i) => ({
      repoId: 1,
      kind: "commit" as const,
      occurredAt: new Date(Date.now() - i * dayMs).toISOString(),
      count: 1,
    }));
    const first = await runGithubSync({
      db: env.DB,
      provider: new FakeGithubProvider([repo({ repoId: 1, name: "portfo" })], many),
      log: console,
      login: "maiphh",
    });
    expect(first).toMatchObject({ ok: true, activityDays: 120 });
    const live = await env.DB.prepare("SELECT COUNT(*) AS n FROM github_activity").first<{
      n: number;
    }>();
    const staging = await env.DB.prepare("SELECT COUNT(*) AS n FROM github_activity_next").first<{
      n: number;
    }>();
    expect(live?.n).toBe(120);
    expect(staging?.n).toBe(0);

    const second = await runGithubSync({
      db: env.DB,
      provider: new FakeGithubProvider(
        [repo({ repoId: 1, name: "portfo" })],
        [{ repoId: 1, kind: "commit", occurredAt: new Date().toISOString(), count: 3 }],
      ),
      log: console,
      login: "maiphh",
    });
    expect(second).toMatchObject({ ok: true, activityDays: 1 });
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM github_activity").first<{
      n: number;
    }>();
    const stagingAfter = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM github_activity_next",
    ).first<{ n: number }>();
    expect(after?.n).toBe(1);
    expect(stagingAfter?.n).toBe(0);
  });

  it("leaves the previous live activity when filling staging throws", async () => {
    await runGithubSync({
      db: env.DB,
      provider: new FakeGithubProvider(
        [repo({ repoId: 1, name: "portfo" })],
        [{ repoId: 1, kind: "commit", occurredAt: new Date().toISOString(), count: 2 }],
      ),
      log: console,
      login: "maiphh",
    });
    const before = await env.DB.prepare("SELECT date, repo_id, commits FROM github_activity").all();
    expect(before.results?.length).toBe(1);

    const stagingBound = new WeakSet<object>();
    const failingDb = {
      prepare(sql: string) {
        const stmt = env.DB.prepare(sql);
        if (/INSERT\s+INTO\s+github_activity_next/i.test(sql)) {
          return {
            bind(...args: unknown[]) {
              const bound = stmt.bind(...args);
              stagingBound.add(bound);
              return bound;
            },
          };
        }
        return stmt;
      },
      batch(stmts: D1PreparedStatement[]) {
        if (stmts.some((s) => stagingBound.has(s))) throw new Error("forced staging failure");
        return env.DB.batch(stmts);
      },
    } as unknown as D1Database;

    const result = await runGithubSync({
      db: failingDb,
      provider: new FakeGithubProvider(
        [repo({ repoId: 1, name: "portfo" })],
        [
          { repoId: 1, kind: "commit", occurredAt: new Date().toISOString(), count: 9 },
          {
            repoId: 1,
            kind: "pr",
            occurredAt: new Date(Date.now() - 86_400_000).toISOString(),
            count: 1,
          },
        ],
      ),
      log: console,
      login: "maiphh",
    });
    expect(result).toMatchObject({ ok: false, error: "sync_failed" });

    const after = await env.DB.prepare("SELECT date, repo_id, commits FROM github_activity").all();
    expect(after.results).toEqual(before.results);
    const staging = await env.DB.prepare("SELECT COUNT(*) AS n FROM github_activity_next").first<{
      n: number;
    }>();
    expect(staging?.n).toBe(0);
  });
});

describe("POST /cron/github-sync", () => {
  it("requires Bearer CRON_SECRET", async () => {
    const { res: noSecret } = await call(
      new Request("https://api.test/cron/github-sync", { method: "POST" }),
      testEnv({ CRON_SECRET: undefined }),
    );
    expect(noSecret.status).toBe(503);

    const { res: bad } = await call(
      new Request("https://api.test/cron/github-sync", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(bad.status).toBe(401);

    // Mock GitHub GraphQL so a real sync does not hit the network.
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({
        data: {
          user: {
            repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
            contributionsCollection: {
              commitContributionsByRepository: [],
              pullRequestContributionsByRepository: [],
              issueContributionsByRepository: [],
            },
          },
        },
      }),
    );
    const { res: ok } = await call(
      new Request("https://api.test/cron/github-sync", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret", Origin: ORIGIN },
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, repos: 0 });
  });
});

describe("GET /activity", () => {
  it("returns empty before the first successful sync", async () => {
    const { res } = await call(
      new Request("https://api.test/activity", { headers: { Origin: ORIGIN } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(await res.json()).toMatchObject({ status: "empty", reason: "never_synced" });
  });
});
