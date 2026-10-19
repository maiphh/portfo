import { describe, expect, it } from "vitest";
import { createGraphqlProvider, GithubError } from "./provider";

/** A fetch stub that records requests and answers from a queue. No network. */
function stubFetch(...answers: (Response | (() => Response))[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fn = ((url: string, init: RequestInit) => {
    requests.push({ url, init });
    const a = answers.shift();
    return Promise.resolve(
      typeof a === "function" ? a() : (a ?? new Response(null, { status: 599 })),
    );
  }) as unknown as typeof fetch;
  return { fn, requests };
}

const repoNode = (id: number, name: string, extra = {}) => ({
  databaseId: id,
  name,
  url: `https://github.com/maiphh/${name}`,
  description: null,
  isFork: false,
  isArchived: false,
  isPrivate: false,
  stargazerCount: 2,
  pushedAt: "2026-10-18T00:00:00Z",
  primaryLanguage: { name: "TypeScript" },
  repositoryTopics: { nodes: [{ topic: { name: "astro" } }] },
  ...extra,
});

describe("createGraphqlProvider", () => {
  it("pages through repos with a bearer token", async () => {
    const { fn, requests } = stubFetch(
      Response.json({
        data: {
          user: {
            repositories: {
              pageInfo: { hasNextPage: true, endCursor: "c1" },
              nodes: [repoNode(1, "a")],
            },
          },
        },
      }),
      Response.json({
        data: {
          user: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [repoNode(2, "b")],
            },
          },
        },
      }),
    );
    const repos = await createGraphqlProvider({ token: "t0k", fetch: fn }).listRepos("maiphh");
    expect(repos.map((r) => [r.repoId, r.name, r.language, r.topics])).toEqual([
      [1, "a", "TypeScript", ["astro"]],
      [2, "b", "TypeScript", ["astro"]],
    ]);
    expect(requests).toHaveLength(2);
    expect((requests[0]?.init.headers as Record<string, string> | undefined)?.Authorization).toBe(
      "Bearer t0k",
    );
    expect(JSON.parse(requests[1]?.init.body as string).variables).toEqual({
      login: "maiphh",
      after: "c1",
    });
  });

  it("flattens contributions and never returns private repos", async () => {
    const group = (id: number, isPrivate: boolean, nodes: unknown[], hasNextPage = false) => ({
      repository: { databaseId: id, isPrivate },
      contributions: { pageInfo: { hasNextPage }, nodes },
    });
    const { fn } = stubFetch(
      Response.json({
        data: {
          user: {
            contributionsCollection: {
              commitContributionsByRepository: [
                group(1, false, [{ occurredAt: "2026-10-18T17:00:00Z", commitCount: 3 }], true),
                group(9, true, [{ occurredAt: "2026-10-18T17:00:00Z", commitCount: 7 }]),
              ],
              pullRequestContributionsByRepository: [
                group(1, false, [{ occurredAt: "2026-10-19T02:00:00Z" }]),
              ],
              issueContributionsByRepository: [],
            },
          },
        },
      }),
    );
    const page = await createGraphqlProvider({ token: "t", fetch: fn }).listContributions(
      "maiphh",
      "a",
      "b",
    );
    expect(page.truncated).toBe(true);
    expect(page.contributions).toEqual([
      { repoId: 1, kind: "commit", occurredAt: "2026-10-18T17:00:00Z", count: 3 },
      { repoId: 1, kind: "pr", occurredAt: "2026-10-19T02:00:00Z", count: 1 },
    ]);
  });

  it("turns HTTP and GraphQL errors into GithubError", async () => {
    const http = stubFetch(new Response("bad credentials", { status: 401 }));
    await expect(
      createGraphqlProvider({ token: "t", fetch: http.fn }).listRepos("maiphh"),
    ).rejects.toThrow(new GithubError("GitHub GraphQL HTTP 401"));
    const gql = stubFetch(Response.json({ errors: [{ message: "Something went wrong" }] }));
    await expect(
      createGraphqlProvider({ token: "t", fetch: gql.fn }).listRepos("maiphh"),
    ).rejects.toThrow(/Something went wrong/);
    const nouser = stubFetch(Response.json({ data: { user: null } }));
    await expect(
      createGraphqlProvider({ token: "t", fetch: nouser.fn }).listRepos("ghost"),
    ).rejects.toThrow(/not found/);
  });
});
