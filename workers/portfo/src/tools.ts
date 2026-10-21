/**
 * The chat agent's tools. All read-only. Each has a zod schema that both validates the
 * model's arguments and becomes the JSON schema the model sees. Results carry the
 * sources (page links or sections) they came from; only those can be cited.
 */
import { z } from "zod";
import { getPopular } from "./analytics/popular";
import type { Config } from "./config";
import { siteData, type SiteData } from "./data";
import type { Env } from "./env";
import { getActivity } from "./github/activity";
import { workList } from "./work";

export interface Source {
  title: string;
  href: string;
}

export interface ToolResult {
  /** What the model sees (JSON-serialised). */
  data: unknown;
  sources: Source[];
  /** True when the tool found nothing, so it can't support an answer. */
  empty: boolean;
}

export interface ToolContext {
  env: Pick<Env, "DB">;
  cfg: Config;
  data?: SiteData;
}

interface Tool<S extends z.ZodType> {
  name: string;
  description: string;
  /** Shown by the mascot while the tool runs. */
  label: string;
  schema: S;
  run(args: z.infer<S>, ctx: ToolContext): Promise<ToolResult>;
}

const tool = <S extends z.ZodType>(t: Tool<S>) => t;

/** Thrown for problems the model can fix or report (bad args, site unreachable). */
export class ToolError extends Error {
  override name = "ToolError";
}

const ok = (data: unknown, sources: Source[], empty = false): ToolResult => ({
  data,
  sources,
  empty,
});

const projectSource = (p: { title: string; href: string }): Source => ({
  title: p.title,
  href: p.href,
});

/* ---------- site content (bundled JSON) ---------- */

const listProjects = tool({
  name: "list_projects",
  description:
    "List every project on Phu's portfolio: slug, title, one-liner, tags, organisation, his role, period and links.",
  label: "Looking up projects…",
  schema: z.object({}).strict(),
  async run(_args, ctx) {
    const projects = (ctx.data ?? siteData).projects;
    return ok(
      projects.map((p) => ({
        slug: p.slug,
        title: p.title,
        oneLiner: p.oneLiner,
        tags: p.tags,
        org: p.org,
        role: p.role,
        period: p.period,
        href: p.href,
        links: p.links,
      })),
      projects.map(projectSource),
      projects.length === 0,
    );
  },
});

const getProject = tool({
  name: "get_project",
  description:
    "Get one full case study by slug (from list_projects): the problem, approach steps, tags, outcomes and metrics, links and the write-up. Employer work (confidential) is CV-level only.",
  label: "Reading the case study…",
  schema: z
    .object({
      slug: z
        .string()
        .regex(/^[a-z0-9-]{1,60}$/, "slug must be lowercase letters, digits and dashes"),
    })
    .strict(),
  async run({ slug }, ctx) {
    const p = (ctx.data ?? siteData).projects.find((x) => x.slug === slug);
    if (!p)
      throw new ToolError(`No project with slug "${slug}". Call list_projects for the slugs.`);
    return ok(
      {
        slug: p.slug,
        title: p.title,
        headline: p.headline,
        summary: p.oneLiner,
        org: p.org,
        role: p.role,
        period: p.period,
        tags: p.tags,
        approach: p.approach,
        outcomes: p.outcomes,
        note: p.note,
        confidential: p.confidential,
        links: p.links,
        href: p.href,
        writeUp: p.body,
      },
      [projectSource(p)],
    );
  },
});

const getExperience = tool({
  name: "get_experience",
  description:
    "Get Phu's CV timeline: jobs (role, employer, dates, highlights), education and awards.",
  label: "Checking the CV…",
  schema: z.object({}).strict(),
  async run(_args, ctx) {
    const d = ctx.data ?? siteData;
    const by = (k: string) =>
      d.experience
        .filter((e) => e.kind === k)
        .map((e) => ({
          title: e.title,
          detail: e.detail,
          start: e.start,
          end: e.end ?? "now",
          highlight: e.highlight,
        }));
    return ok(
      { profile: d.profile, work: by("work"), education: by("study"), awards: by("award") },
      [{ title: "Experience", href: "/#timeline" }],
      d.experience.length === 0,
    );
  },
});

const getContact = tool({
  name: "get_contact",
  description:
    "Get how to reach Phu: email, GitHub and the contact form. Availability is not published, so never state it.",
  label: "Getting contact details…",
  schema: z.object({}).strict(),
  async run(_args, ctx) {
    const c = (ctx.data ?? siteData).contact;
    return ok(
      {
        email: c.email,
        github: c.github,
        contactForm: c.contactHref,
        howToReach: c.howToReach,
        availability: "Not published. Don't guess; suggest asking him by email.",
      },
      [{ title: "Contact", href: c.contactHref }],
    );
  },
});

/* ---------- live D1 (same Worker) ---------- */

const getGithubStats = tool({
  name: "get_github_stats",
  description:
    'Get Phu\'s public GitHub activity: repo count, commits in the last year, streak, languages of recently pushed repos, and recent activity. range "year" (default) gives totals; "recent" gives the last 14 days.',
  label: "Checking GitHub activity…",
  schema: z.object({ range: z.enum(["year", "recent"]).optional() }).strict(),
  async run({ range = "year" }, ctx) {
    let a: Awaited<ReturnType<typeof getActivity>>;
    try {
      a = await getActivity(ctx.env.DB, { login: ctx.cfg.login });
    } catch {
      throw new ToolError("GitHub activity is unavailable right now.");
    }
    const sources: Source[] = [{ title: "GitHub activity", href: "/#activity" }];
    if (a.status !== "ok" || !a.summary)
      return ok({ status: a.status, note: "No GitHub activity synced yet." }, [], true);
    const counts = new Map<string, number>();
    for (const r of a.repos)
      if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
    const languages = [...counts]
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .map(([language, repos]) => ({ language, repos }));
    const repos = a.repos.map((r) => ({
      name: r.name,
      url: r.url,
      description: r.description,
      language: r.language,
      stars: r.stars,
      pushedAt: r.pushedAt,
    }));
    const base = {
      languages,
      languagesFrom: `the ${a.repos.length} most recently pushed public repos`,
      lastSyncedAt: a.summary.lastSyncedAt,
    };
    const data =
      range === "recent"
        ? {
            ...base,
            recentActivity: a.summary.feed,
            streakDays: a.summary.streakDays,
            repos: repos.filter(
              (r) => r.pushedAt && Date.parse(r.pushedAt) > Date.now() - 14 * 86_400_000,
            ),
          }
        : {
            ...base,
            publicRepos: a.summary.publicRepos,
            commitsLastYear: a.summary.commitsLastYear,
            streakDays: a.summary.streakDays,
            repos,
          };
    return ok(data, sources);
  },
});

const getPopularProjects = tool({
  name: "get_popular_projects",
  description:
    "Get the most-viewed projects on the site over the last N days (1 to 30, default 7), most views first.",
  label: "Checking what's popular…",
  schema: z.object({ days: z.number().int().min(1).max(30).optional() }).strict(),
  async run({ days = 7 }, ctx) {
    let popular: Awaited<ReturnType<typeof getPopular>>;
    try {
      popular = await getPopular(ctx.env.DB, workList, { days });
    } catch {
      throw new ToolError("Popular projects are unavailable right now.");
    }
    const pages = new Map((ctx.data ?? siteData).projects.map((p) => [p.slug, p]));
    const items = popular.items.map((i) => ({
      slug: i.slug,
      title: i.title,
      views: i.views,
      href: pages.get(i.slug)?.href ?? i.href,
    }));
    return ok(
      { days: popular.days, items },
      items.map((i) => ({ title: i.title, href: i.href })),
      items.length === 0,
    );
  },
});

export const tools = [
  listProjects,
  getProject,
  getExperience,
  getGithubStats,
  getPopularProjects,
  getContact,
] as const;

export type ToolName = (typeof tools)[number]["name"];

const byName = new Map<string, Tool<z.ZodType>>(
  tools.map((t) => [t.name, t as unknown as Tool<z.ZodType>]),
);

export function getTool(name: string) {
  return byName.get(name);
}

/** Tool definitions in the shape Workers AI function calling expects. */
export function toolDefinitions() {
  return tools.map((t) => {
    const parameters = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete parameters.$schema;
    delete parameters.additionalProperties;
    return {
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: { type: "object", properties: {}, ...parameters },
      },
    };
  });
}

export type ToolOutcome =
  { ok: true; name: string; result: ToolResult } | { ok: false; name: string; error: string };

/** Validates and runs one call. Never throws: unknown tools, bad args and failures become tool errors. */
export async function runTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const t = getTool(name);
  if (!t) return { ok: false, name, error: `Unknown tool "${name}".` };
  let args = rawArgs;
  if (typeof args === "string") {
    try {
      args = args.trim() ? JSON.parse(args) : {};
    } catch {
      return { ok: false, name, error: "Arguments were not valid JSON." };
    }
  }
  const parsed = t.schema.safeParse(args ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".") || "args"}: ${i.message}`)
      .join("; ");
    return { ok: false, name, error: `Invalid arguments: ${msg}` };
  }
  try {
    return { ok: true, name, result: await t.run(parsed.data, ctx) };
  } catch (err) {
    return { ok: false, name, error: err instanceof ToolError ? err.message : "The tool failed." };
  }
}
