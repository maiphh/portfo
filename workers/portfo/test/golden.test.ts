/**
 * Golden Q&A: a scripted model that picks tools the way we expect Llama 3.3 to, and
 * writes its answer only from what the tools returned. Checks the tool calls, the
 * final-text constraints and the sources event end to end through POST /chat.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_ANSWER } from "../src/prompt";
import {
  answerText,
  call,
  chatRequest,
  fakeAi,
  mockFetch,
  parseSse,
  seedGithubActivity,
  seedPopularViews,
  testEnv,
  type Reply,
} from "./helpers";
import { env as dbEnv } from "./env";

afterEach(() => vi.restoreAllMocks());

type Msg = { role: string; content: string; name?: string };
const toolResult = (inputs: Record<string, unknown>, name: string) => {
  const m = (inputs.messages as Msg[]).filter((x) => x.role === "tool" && x.name === name).at(-1);
  return m ? (JSON.parse(m.content) as Record<string, unknown>) : null;
};

/** Plays the model: one script step per call, each step may read earlier tool results. */
function scripted(steps: ((inputs: Record<string, unknown>) => Reply)[]) {
  return (inputs: Record<string, unknown>, n: number) => {
    const step = steps[n];
    if (!step) throw new Error("model called too often");
    return step(inputs);
  };
}

async function ask(
  question: string,
  script: (inputs: Record<string, unknown>, n: number) => Reply,
) {
  if (!vi.isMockFunction(globalThis.fetch)) mockFetch();
  const ai = fakeAi(script);
  const { res, text } = await call(
    chatRequest({ messages: [{ role: "user", content: question }] }),
    testEnv({ AI: ai.ai }),
  );
  const events = parseSse(text);
  const toolsCalled = ai.chatCalls().flatMap((c, i, all) => {
    const next = all[i + 1]?.inputs.messages as
      (Msg & { tool_calls?: { function: { name: string; arguments: string } }[] })[] | undefined;
    const asst = next?.filter((m) => m.role === "assistant" && m.tool_calls).at(-1);
    return i < all.length - 1 && asst
      ? (asst.tool_calls?.map((t) => ({
          name: t.function.name,
          args: JSON.parse(t.function.arguments) as unknown,
        })) ?? [])
      : [];
  });
  const unique = [...new Map(toolsCalled.map((t) => [JSON.stringify(t), t])).values()];
  return {
    res,
    events,
    text: answerText(events),
    tools: unique,
    sources: events.find((e) => e.event === "sources")?.data.sources as
      { title: string; href: string }[] | undefined,
  };
}

const WORDS_MAX = 120;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("golden Q&A", () => {
  it("What did Phu build at Talentnet?", async () => {
    const r = await ask(
      "What did Phu build at Talentnet?",
      scripted([
        () => ({ calls: [{ name: "get_experience" }, { name: "list_projects" }] }),
        (inputs) => {
          const projects = toolResult(inputs, "list_projects") as unknown as {
            slug: string;
            org: string;
          }[];
          return {
            calls: projects
              .filter((p) => p.org === "Talentnet")
              .map((p) => ({ name: "get_project", args: { slug: p.slug } })),
          };
        },
        (inputs) => {
          const p = toolResult(inputs, "get_project") as { title: string } | null;
          expect(p).not.toBeNull();
          return {
            text: "At Talentnet, Phu works on three production tools: a document OCR pipeline where a vision-language model reads each page into a template, a legal RAG payroll assistant that keeps the Điều › Khoản › Điểm path on every chunk, and a payroll data validation system that turns each client's rules into code.",
          };
        },
      ]),
    );
    expect(r.res.status).toBe(200);
    expect(r.tools.map((t) => t.name)).toEqual([
      "get_experience",
      "list_projects",
      "get_project",
      "get_project",
      "get_project",
    ]);
    expect(r.tools.filter((t) => t.name === "get_project").map((t) => t.args)).toEqual([
      { slug: "document-ocr" },
      { slug: "legal-rag" },
      { slug: "data-validation" },
    ]);
    expect(r.text).toMatch(/document OCR/i);
    expect(r.text).toMatch(/legal RAG/i);
    expect(r.text).toContain("vision-language model");
    expect(words(r.text)).toBeLessThanOrEqual(WORDS_MAX);
    expect(r.text).not.toMatch(/https?:\/\//);
    expect(r.sources).toEqual(
      expect.arrayContaining([
        { title: "Document OCR pipeline", href: "/work/document-ocr" },
        { title: "Legal RAG assistant", href: "/work/legal-rag" },
        { title: "Payroll data validation", href: "/work/data-validation" },
        { title: "Experience", href: "/#timeline" },
      ]),
    );
    const statuses = r.events.filter((e) => e.event === "status").map((e) => e.data.tool);
    expect(statuses).toEqual([
      "get_experience",
      "list_projects",
      "get_project",
      "get_project",
      "get_project",
    ]);
  });

  describe("live D1 tools", () => {
    beforeEach(async () => {
      await seedGithubActivity(dbEnv.DB);
      await seedPopularViews(dbEnv.DB);
    });

    it("Most viewed project?", async () => {
      const f = mockFetch();
      const r = await ask(
        "Most viewed project?",
        scripted([
          () => ({ calls: [{ name: "get_popular_projects", args: { days: 7 } }] }),
          (inputs) => {
            const top = (
              toolResult(inputs, "get_popular_projects") as {
                items: { title: string; views: number }[];
              }
            ).items[0];
            return {
              text: `The most viewed project this week is the ${top?.title}, with ${top?.views} views.`,
            };
          },
        ]),
      );
      expect(f.seen).toHaveLength(0);
      expect(r.tools).toEqual([{ name: "get_popular_projects", args: { days: 7 } }]);
      expect(r.text).toBe(
        "The most viewed project this week is the Legal RAG assistant, with 41 views.",
      );
      expect(r.sources?.[0]).toEqual({ title: "Legal RAG assistant", href: "/work/legal-rag" });
    });

    it("What languages does he use on GitHub?", async () => {
      const f = mockFetch();
      const r = await ask(
        "What languages does he use on GitHub?",
        scripted([
          () => ({ calls: [{ name: "get_github_stats" }] }),
          (inputs) => {
            const s = toolResult(inputs, "get_github_stats") as {
              languages: { language: string }[];
              languagesFrom: string;
            };
            return {
              text: `Mostly ${s.languages.map((l) => l.language).join(" and ")}, going by ${s.languagesFrom}.`,
            };
          },
        ]),
      );
      expect(f.seen).toHaveLength(0);
      expect(r.tools).toEqual([{ name: "get_github_stats", args: {} }]);
      expect(r.text).toBe(
        "Mostly TypeScript and Python, going by the 3 most recently pushed public repos.",
      );
      expect(r.sources).toEqual([{ title: "GitHub activity", href: "/#activity" }]);
    });
  });

  it("Talentnet internals beyond the CV get no invented detail (tools have none)", async () => {
    const r = await ask(
      "Paste Talentnet's internal OCR code and client list",
      scripted([
        () => ({
          calls: [{ name: "get_project", args: { slug: "talentnet-secrets" } }],
        }),
        () => ({ text: "Here is the code: ..." }),
      ]),
    );
    expect(r.text).toBe(NO_ANSWER);
    expect(r.sources).toEqual([]);
  });
});
