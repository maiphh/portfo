/**
 * GitHub GraphQL provider. Only public data; token can be read-only.
 */
export interface RepoData {
  repoId: number;
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  topics: string[];
  pushedAt: string | null;
  isFork: boolean;
  isArchived: boolean;
  isPrivate: boolean;
}

export interface ContributionData {
  repoId: number;
  kind: "commit" | "pr" | "issue";
  occurredAt: string;
  count: number;
}

export interface ContributionsPage {
  contributions: ContributionData[];
  truncated: boolean;
}

export interface GithubProvider {
  listRepos(login: string): Promise<RepoData[]>;
  listContributions(login: string, from: string, to: string): Promise<ContributionsPage>;
}

export class GithubError extends Error {
  override name = "GithubError";
}

const GRAPHQL_URL = "https://api.github.com/graphql";
const MAX_REPO_PAGES = 10;

const REPOS_QUERY = `
query Repos($login: String!, $after: String) {
  user(login: $login) {
    repositories(first: 100, after: $after, privacy: PUBLIC, ownerAffiliations: [OWNER],
                 orderBy: { field: PUSHED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        databaseId name url description isFork isArchived isPrivate stargazerCount pushedAt
        primaryLanguage { name }
        repositoryTopics(first: 10) { nodes { topic { name } } }
      }
    }
  }
}`;

const CONTRIBUTIONS_QUERY = `
query Contributions($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository(maxRepositories: 100) {
        repository { databaseId isPrivate }
        contributions(first: 100) { pageInfo { hasNextPage } nodes { occurredAt commitCount } }
      }
      pullRequestContributionsByRepository(maxRepositories: 100) {
        repository { databaseId isPrivate }
        contributions(first: 100) { pageInfo { hasNextPage } nodes { occurredAt } }
      }
      issueContributionsByRepository(maxRepositories: 100) {
        repository { databaseId isPrivate }
        contributions(first: 100) { pageInfo { hasNextPage } nodes { occurredAt } }
      }
    }
  }
}`;

interface RepoNode {
  databaseId: number;
  name: string;
  url: string;
  description: string | null;
  isFork: boolean;
  isArchived: boolean;
  isPrivate: boolean;
  stargazerCount: number;
  pushedAt: string | null;
  primaryLanguage: { name: string } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
}

interface ByRepo<N> {
  repository: { databaseId: number; isPrivate: boolean };
  contributions: { pageInfo: { hasNextPage: boolean }; nodes: N[] };
}

interface ContributionsData {
  user: {
    contributionsCollection: {
      commitContributionsByRepository: ByRepo<{ occurredAt: string; commitCount: number }>[];
      pullRequestContributionsByRepository: ByRepo<{ occurredAt: string }>[];
      issueContributionsByRepository: ByRepo<{ occurredAt: string }>[];
    };
  } | null;
}

export function createGraphqlProvider(opts: {
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): GithubProvider {
  const doFetch = opts.fetch ?? fetch;
  async function query<T>(q: string, variables: Record<string, unknown>): Promise<T> {
    const res = await doFetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        "Content-Type": "application/json",
        "User-Agent": "portfo-github-sync",
      },
      body: JSON.stringify({ query: q, variables }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    if (!res.ok) throw new GithubError(`GitHub GraphQL HTTP ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      throw new GithubError(`GitHub GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    if (!json.data) throw new GithubError("GitHub GraphQL: empty response");
    return json.data;
  }

  return {
    async listRepos(login) {
      const repos: RepoData[] = [];
      let after: string | null = null;
      for (let page = 0; page < MAX_REPO_PAGES; page++) {
        const data: {
          user: {
            repositories: {
              pageInfo: { hasNextPage: boolean; endCursor: string | null };
              nodes: RepoNode[];
            };
          } | null;
        } = await query(REPOS_QUERY, { login, after });
        if (!data.user) throw new GithubError(`GitHub user "${login}" not found`);
        const { nodes, pageInfo } = data.user.repositories;
        for (const n of nodes) {
          repos.push({
            repoId: n.databaseId,
            name: n.name,
            url: n.url,
            description: n.description,
            language: n.primaryLanguage?.name ?? null,
            stars: n.stargazerCount,
            topics: n.repositoryTopics.nodes.map((t) => t.topic.name),
            pushedAt: n.pushedAt,
            isFork: n.isFork,
            isArchived: n.isArchived,
            isPrivate: n.isPrivate,
          });
        }
        if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
        after = pageInfo.endCursor;
      }
      return repos;
    },

    async listContributions(login, from, to) {
      const data = await query<ContributionsData>(CONTRIBUTIONS_QUERY, { login, from, to });
      if (!data.user) throw new GithubError(`GitHub user "${login}" not found`);
      const c = data.user.contributionsCollection;
      const out: ContributionData[] = [];
      let truncated = false;
      const take = <N extends { occurredAt: string }>(
        groups: ByRepo<N>[],
        kind: ContributionData["kind"],
        count: (n: N) => number,
      ) => {
        for (const g of groups) {
          if (g.repository.isPrivate) continue;
          truncated ||= g.contributions.pageInfo.hasNextPage;
          for (const n of g.contributions.nodes) {
            out.push({
              repoId: g.repository.databaseId,
              kind,
              occurredAt: n.occurredAt,
              count: count(n),
            });
          }
        }
      };
      take(c.commitContributionsByRepository, "commit", (n) => n.commitCount);
      take(c.pullRequestContributionsByRepository, "pr", () => 1);
      take(c.issueContributionsByRepository, "issue", () => 1);
      return { contributions: out, truncated };
    },
  };
}
