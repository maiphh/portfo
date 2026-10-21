import { beforeEach, describe, expect, it } from "vitest";
import { siteData } from "../src/data";
import { runTool, toolDefinitions, tools } from "../src/tools";
import { env } from "./env";
import { seedGithubActivity, seedPopularViews, toolCtx } from "./helpers";

const okResult = async (name: string, args: unknown, ctx = toolCtx()) => {
  const o = await runTool(name, args, ctx);
  if (!o.ok) throw new Error(`expected ok, got ${o.error}`);
  return o.result;
};

describe("tool definitions", () => {
  it("exposes the six read-only tools with object JSON schemas", () => {
    const defs = toolDefinitions();
    expect(defs.map((d) => d.function.name)).toEqual([
      "list_projects",
      "get_project",
      "get_experience",
      "get_github_stats",
      "get_popular_projects",
      "get_contact",
    ]);
    for (const d of defs) expect(d.function.parameters.type).toBe("object");
    const gp = defs.find((d) => d.function.name === "get_project")?.function.parameters as {
      required?: string[];
    };
    expect(gp.required).toEqual(["slug"]);
    expect(tools.every((t) => t.label.endsWith("…"))).toBe(true);
  });
});

describe("list_projects", () => {
  it("lists every case study from the generated site data, with page links as sources", async () => {
    const r = await okResult("list_projects", {});
    const data = r.data as { slug: string; href: string; tags: string[] }[];
    expect(data.map((p) => p.slug)).toEqual(siteData.projects.map((p) => p.slug));
    expect(data[0]).toMatchObject({
      slug: "document-ocr",
      href: "/work/document-ocr",
      org: "Talentnet",
      role: "AI Engineer Specialist",
    });
    expect(r.sources).toContainEqual({ title: "Legal RAG assistant", href: "/work/legal-rag" });
    expect(r.empty).toBe(false);
  });
});

describe("get_project", () => {
  it("returns the full case study", async () => {
    const r = await okResult("get_project", { slug: "document-ocr" });
    expect(r.data).toMatchObject({
      title: "Document OCR pipeline",
      confidential: true,
      // projects/ocr/README.md "## Result", confirmed by Phu.
      outcomes: [
        { value: "8,000", label: "pages processed" },
        { value: "99.6%", label: "accuracy" },
        { value: "About 300", label: "hours saved" },
      ],
    });
    expect((r.data as { approach: unknown[] }).approach).toHaveLength(4);
    expect(r.sources).toEqual([{ title: "Document OCR pipeline", href: "/work/document-ocr" }]);
  });

  it("turns an unknown slug or a bad slug into a tool error", async () => {
    expect(await runTool("get_project", { slug: "secret-project" }, toolCtx())).toMatchObject({
      ok: false,
      error: expect.stringContaining("list_projects"),
    });
    expect(await runTool("get_project", { slug: "../etc" }, toolCtx())).toMatchObject({
      ok: false,
      error: expect.stringContaining("Invalid arguments"),
    });
    expect(await runTool("get_project", {}, toolCtx())).toMatchObject({ ok: false });
  });
});

describe("get_experience", () => {
  it("splits the CV into work, education and awards", async () => {
    const r = await okResult("get_experience", {});
    const d = r.data as {
      work: { title: string; end: string }[];
      education: unknown[];
      awards: { title: string }[];
    };
    expect(d.work.map((w) => w.title)).toEqual(["Talentnet", "Garena Free Fire"]);
    expect(d.work[0]?.end).toBe("now");
    expect(d.education).toHaveLength(2);
    expect(d.awards[0]?.title).toBe("Neo League 2025");
    expect(r.sources).toEqual([{ title: "Experience", href: "/#timeline" }]);
  });
});

describe("get_contact", () => {
  it("returns the public contact routes and never an availability claim", async () => {
    const r = await okResult("get_contact", {});
    expect(r.data).toMatchObject({
      email: "maiphh29@gmail.com",
      github: "https://github.com/maiphh",
      contactForm: "/#contact",
    });
    expect(String((r.data as { availability: string }).availability)).toMatch(/not published/i);
  });

  it("rejects unexpected arguments", async () => {
    expect(await runTool("get_contact", { phone: true }, toolCtx())).toMatchObject({ ok: false });
  });
});

describe("get_github_stats", () => {
  beforeEach(async () => {
    await seedGithubActivity(env.DB);
  });

  it("reads D1 activity and derives languages", async () => {
    const r = await okResult("get_github_stats", {});
    expect(r.data).toMatchObject({
      publicRepos: 3,
      languages: [
        { language: "TypeScript", repos: 2 },
        { language: "Python", repos: 1 },
      ],
    });
    expect((r.data as { commitsLastYear: number }).commitsLastYear).toBeGreaterThan(0);
    expect(r.sources).toEqual([{ title: "GitHub activity", href: "/#activity" }]);
  });

  it('range "recent" returns the feed and only recently pushed repos', async () => {
    const r = await okResult("get_github_stats", { range: "recent" });
    const d = r.data as { recentActivity: unknown[]; repos: { name: string }[] };
    expect(d.recentActivity.length).toBeGreaterThan(0);
    expect(d.repos.map((x) => x.name)).toEqual(["portfo"]);
  });

  it("is empty before the first sync, and a tool error when D1 throws", async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM github_activity"),
      env.DB.prepare("DELETE FROM github_activity_next"),
      env.DB.prepare("DELETE FROM github_repos"),
      env.DB.prepare("DELETE FROM sync_runs"),
    ]);
    expect((await okResult("get_github_stats", {})).empty).toBe(true);

    const broken = {
      prepare() {
        throw new Error("boom");
      },
    } as unknown as D1Database;
    expect(await runTool("get_github_stats", {}, toolCtx({ DB: broken }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("unavailable"),
    });
    expect(await runTool("get_github_stats", { range: "forever" }, toolCtx())).toMatchObject({
      ok: false,
    });
  });
});

describe("get_popular_projects", () => {
  beforeEach(async () => {
    await seedPopularViews(env.DB);
  });

  it("reads D1 views with days and links to the case-study pages", async () => {
    const r = await okResult("get_popular_projects", { days: 14 });
    expect((r.data as { items: unknown[] }).items[0]).toEqual({
      slug: "legal-rag",
      title: "Legal RAG assistant",
      views: 41,
      href: "/work/legal-rag",
    });
    expect(r.sources[0]).toEqual({ title: "Legal RAG assistant", href: "/work/legal-rag" });
  });

  it("validates days and reports no views as empty", async () => {
    expect(await runTool("get_popular_projects", { days: 365 }, toolCtx())).toMatchObject({
      ok: false,
    });
    expect(await runTool("get_popular_projects", { days: "7" }, toolCtx())).toMatchObject({
      ok: false,
    });
    await env.DB.prepare("DELETE FROM page_views").run();
    expect((await okResult("get_popular_projects", {})).empty).toBe(true);
  });

  it("is a tool error when D1 throws", async () => {
    const broken = {
      prepare() {
        throw new Error("boom");
      },
    } as unknown as D1Database;
    expect(await runTool("get_popular_projects", {}, toolCtx({ DB: broken }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("unavailable"),
    });
  });
});

describe("runTool", () => {
  it("never throws: unknown tools, broken JSON and thrown errors become tool errors", async () => {
    expect(await runTool("delete_everything", {}, toolCtx())).toEqual({
      ok: false,
      name: "delete_everything",
      error: 'Unknown tool "delete_everything".',
    });
    expect(await runTool("get_project", "{not json", toolCtx())).toMatchObject({
      ok: false,
      error: "Arguments were not valid JSON.",
    });
    expect(await runTool("get_project", '{"slug":"poet"}', toolCtx())).toMatchObject({ ok: true });
  });
});
