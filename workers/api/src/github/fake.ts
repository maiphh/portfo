/** In-memory GithubProvider for tests. Makes no network calls. */
import type { ContributionData, GithubProvider, RepoData } from "./provider";

export class FakeGithubProvider implements GithubProvider {
  calls: { method: "listRepos" | "listContributions"; args: string[] }[] = [];
  constructor(
    public repos: RepoData[] = [],
    public contributions: ContributionData[] = [],
    public opts: { fail?: Error; truncated?: boolean } = {},
  ) {}

  listRepos(login: string): Promise<RepoData[]> {
    this.calls.push({ method: "listRepos", args: [login] });
    if (this.opts.fail) return Promise.reject(this.opts.fail);
    return Promise.resolve(this.repos.map((r) => ({ ...r })));
  }

  listContributions(login: string, from: string, to: string) {
    this.calls.push({ method: "listContributions", args: [login, from, to] });
    if (this.opts.fail) return Promise.reject(this.opts.fail);
    const f = Date.parse(from);
    const t = Date.parse(to);
    const contributions = this.contributions.filter((c) => {
      const at = Date.parse(c.occurredAt);
      return at >= f && at <= t;
    });
    return Promise.resolve({ contributions, truncated: this.opts.truncated ?? false });
  }
}

export function repo(over: Partial<RepoData> & { repoId: number; name: string }): RepoData {
  return {
    url: `https://github.com/maiphh/${over.name}`,
    description: null,
    language: "TypeScript",
    stars: 0,
    topics: [],
    pushedAt: "2026-10-18T09:00:00Z",
    isFork: false,
    isArchived: false,
    isPrivate: false,
    ...over,
  };
}
