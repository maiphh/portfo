import { afterEach, describe, expect, it, vi } from "vitest";
import { siteData } from "../src/data";
import { runTool, toolDefinitions, tools } from "../src/tools";
import { activityOk, fakeAi, fakeVectorize, mockFetch, talentnetMatch, toolCtx } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const okResult = async (name: string, args: unknown, ctx = toolCtx()) => {
  const o = await runTool(name, args, ctx);
  if (!o.ok) throw new Error(`expected ok, got ${o.error}`);
  return o.result;
};

describe("tool definitions", () => {
  it("exposes the seven read-only tools with object JSON schemas", () => {
    const defs = toolDefinitions();
    expect(defs.map((d) => d.function.name)).toEqual([
      "list_projects",
      "get_project",
      "get_experience",
      "get_github_stats",
      "get_popular_projects",
      "search_knowledge",
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
      outcomes: [
        { value: ">98%", label: "accuracy" },
        { value: ">90%", label: "processing time saved" },
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
  it("fetches SITE_URL/api/activity and derives languages", async () => {
    const f = mockFetch();
    const r = await okResult("get_github_stats", {});
    expect(f.seen[0]?.url).toBe("https://site.test/api/activity");
    expect(r.data).toMatchObject({
      publicRepos: 12,
      commitsLastYear: 340,
      languages: [
        { language: "TypeScript", repos: 2 },
        { language: "Python", repos: 1 },
      ],
    });
    expect(r.sources).toEqual([{ title: "GitHub activity", href: "/#activity" }]);
  });

  it('range "recent" returns the feed and only recently pushed repos', async () => {
    mockFetch();
    const r = await okResult("get_github_stats", { range: "recent" });
    const d = r.data as { recentActivity: unknown[]; repos: { name: string }[] };
    expect(d.recentActivity).toEqual(activityOk.summary.feed);
    expect(d.repos.map((x) => x.name)).toEqual(["portfo"]);
  });

  it("is empty before the first sync, and a tool error when the site is down or SITE_URL is unset", async () => {
    mockFetch({ activity: { status: "empty", summary: null, repos: [] } });
    expect((await okResult("get_github_stats", {})).empty).toBe(true);
    vi.restoreAllMocks();
    mockFetch({ status: 503, activity: { status: "unavailable" } });
    expect(await runTool("get_github_stats", {}, toolCtx())).toMatchObject({
      ok: false,
      error: expect.stringContaining("503"),
    });
    expect(await runTool("get_github_stats", {}, toolCtx({ SITE_URL: "" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("not configured"),
    });
    expect(await runTool("get_github_stats", { range: "forever" }, toolCtx())).toMatchObject({
      ok: false,
    });
  });
});

describe("get_popular_projects", () => {
  it("fetches /api/popular with days and links to the case-study pages", async () => {
    const f = mockFetch();
    const r = await okResult("get_popular_projects", { days: 14 });
    expect(f.seen[0]?.url).toBe("https://site.test/api/popular?days=14");
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
    mockFetch({ popular: { items: [], days: 7 } });
    expect((await okResult("get_popular_projects", {})).empty).toBe(true);
  });
});

describe("search_knowledge", () => {
  it("embeds with bge-m3, queries top 5 and keeps matches above the score floor", async () => {
    const ai = fakeAi([]);
    const vec = fakeVectorize([
      talentnetMatch,
      { id: "x:0", score: 0.1, metadata: { title: "Noise", href: "/x", text: "noise" } },
    ]);
    const r = await okResult(
      "search_knowledge",
      { query: "OCR at Talentnet" },
      toolCtx({ AI: ai.ai, VECTORIZE: vec.index }),
    );
    expect(ai.calls[0]).toMatchObject({
      model: "@cf/baai/bge-m3",
      inputs: { text: ["OCR at Talentnet"] },
    });
    expect(vec.queries[0]?.vector).toHaveLength(1024);
    expect(vec.queries[0]?.options).toEqual({ topK: 5, returnMetadata: "all" });
    expect((r.data as { passages: unknown[] }).passages).toHaveLength(1);
    expect(r.sources).toEqual([{ title: "Document OCR pipeline", href: "/work/document-ocr" }]);
  });

  it("returns empty for no matches and rejects a too-short query", async () => {
    const ctx = toolCtx({ AI: fakeAi([]).ai, VECTORIZE: fakeVectorize([]).index });
    expect((await okResult("search_knowledge", { query: "quantum knitting" }, ctx)).empty).toBe(
      true,
    );
    expect(await runTool("search_knowledge", { query: "a" }, ctx)).toMatchObject({ ok: false });
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
    const broken = { run: async () => Promise.reject(new Error("boom")) };
    const ctx = toolCtx({ AI: broken as never, VECTORIZE: fakeVectorize().index });
    expect(await runTool("search_knowledge", { query: "hello" }, ctx)).toMatchObject({
      ok: false,
      error: "The tool failed.",
    });
  });
});
