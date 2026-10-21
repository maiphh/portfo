import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgent, parseReply, type AgentEvent } from "../src/agent";
import { config, MAX_TOOL_ROUNDS } from "../src/config";
import { NO_ANSWER } from "../src/prompt";
import { fakeAi, fakeVectorize, mockFetch, talentnetMatch, testEnv, type Reply } from "./helpers";

afterEach(() => vi.restoreAllMocks());

async function agent(
  script: Reply[] | ((inputs: Record<string, unknown>, n: number) => Reply),
  question: string,
  vectorize = fakeVectorize([talentnetMatch]),
) {
  const ai = fakeAi(script);
  const env = testEnv({ AI: ai.ai, VECTORIZE: vectorize.index });
  const cfg = config(env);
  const events: AgentEvent[] = [];
  const result = await runAgent({
    ai: ai.ai,
    cfg,
    history: [{ role: "user", content: question }],
    ctx: { env, cfg },
    emit: (e) => events.push(e),
  });
  return { result, events, ai };
}

describe("agent loop", () => {
  it("calls the tool the model selects, then answers from its result", async () => {
    const { result, events, ai } = await agent(
      [
        { calls: [{ name: "get_experience" }] },
        { text: "He studied IT at RMIT University, with a 3.7 GPA." },
      ],
      "Where did he study?",
    );
    expect(result.calls).toEqual([{ name: "get_experience", args: {}, ok: true, empty: false }]);
    expect(result.rounds).toBe(1);
    expect(result.text).toBe("He studied IT at RMIT University, with a 3.7 GPA.");
    expect(result.sources).toEqual([{ title: "Experience", href: "/#timeline" }]);
    expect(events[0]).toEqual({
      type: "status",
      tool: "get_experience",
      label: "Checking the CV…",
      round: 1,
    });

    const [first, second] = ai.chatCalls();
    expect(first?.model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(first?.inputs.max_tokens).toBe(400);
    expect((first?.inputs.tools as unknown[]).length).toBe(7);
    const msgs = second?.inputs.messages as {
      role: string;
      content: string;
      tool_calls?: unknown[];
    }[];
    expect(msgs.at(-2)?.tool_calls).toHaveLength(1);
    expect(msgs.at(-1)).toMatchObject({ role: "tool", name: "get_experience" });
    expect(msgs.at(-1)?.content).toContain("RMIT");
  });

  it("stops after 3 tool rounds and forces a final answer without tools", async () => {
    const { result, ai } = await agent(
      (inputs) =>
        inputs.tools
          ? { calls: [{ name: "list_projects" }] }
          : { text: "He has six projects on the site." },
      "Tell me everything",
    );
    const chat = ai.chatCalls();
    expect(result.rounds).toBe(MAX_TOOL_ROUNDS);
    expect(chat).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(chat.slice(0, 3).every((c) => Array.isArray(c.inputs.tools))).toBe(true);
    expect(chat[3]?.inputs.tools).toBeUndefined();
    expect(JSON.stringify(chat[3]?.inputs.messages)).toContain("You have used all 3 tool rounds");
    expect(result.text).toBe("He has six projects on the site.");
    expect(result.calls).toHaveLength(3);
  });

  it('says "I don\'t know" with no sources when the tools return nothing', async () => {
    const { result, events } = await agent(
      [
        { calls: [{ name: "search_knowledge", args: { query: "his favourite pizza" } }] },
        { text: "He loves margherita." },
      ],
      "What's his favourite pizza?",
      fakeVectorize([]),
    );
    expect(result.text).toBe(NO_ANSWER);
    expect(result.sources).toEqual([]);
    expect(result.answered).toBe(false);
    expect(
      events
        .filter((e) => e.type === "token")
        .map((e) => (e as { text: string }).text)
        .join(""),
    ).toBe(NO_ANSWER);
  });

  it('SITE_URL empty (the deployed state): GitHub and popular tools are tool errors, answer is "I don\'t know"', async () => {
    const f = mockFetch();
    const ai = fakeAi([
      { calls: [{ name: "get_github_stats" }, { name: "get_popular_projects" }] },
      { text: "He made 999 commits and Legal RAG is the most viewed." },
    ]);
    const env = testEnv({ AI: ai.ai, VECTORIZE: fakeVectorize([]).index, SITE_URL: "" });
    const cfg = config(env);
    const result = await runAgent({
      ai: ai.ai,
      cfg,
      history: [{ role: "user", content: "How active is he on GitHub, and what's popular?" }],
      ctx: { env, cfg },
      emit: () => {},
    });
    expect(result.calls.map((c) => [c.name, c.ok])).toEqual([
      ["get_github_stats", false],
      ["get_popular_projects", false],
    ]);
    // The model saw the errors as tool results...
    const toolMsgs = (ai.chatCalls()[1]?.inputs.messages as { role: string; content: string }[])
      .filter((m) => m.role === "tool")
      .map((m) => m.content);
    expect(toolMsgs.every((c) => c.includes("not configured"))).toBe(true);
    // ...no request left the Worker, and the made-up answer was replaced.
    expect(f.seen).toHaveLength(0);
    expect(result.text).toBe(NO_ANSWER);
    expect(result.sources).toEqual([]);
  });

  it("refuses off-topic requests: an answer without any tool data becomes the fixed reply", async () => {
    const { result } = await agent(
      [{ text: "Sure! Here's a poem about the sea..." }],
      "Write me a poem about the sea",
    );
    expect(result.text).toBe(NO_ANSWER);
    expect(result.sources).toEqual([]);
  });

  it("feeds bad args back as a tool error, and the model can recover", async () => {
    const { result, ai } = await agent(
      [
        { calls: [{ name: "get_project", args: { slug: "Legal RAG!!" } }] },
        { calls: [{ name: "get_project", args: { slug: "legal-rag" } }] },
        { text: "The Tag Chunker keeps the full Điều › Khoản › Điểm path on every chunk." },
      ],
      "How does the legal RAG cite rules?",
    );
    expect(result.calls.map((c) => c.ok)).toEqual([false, true]);
    const second = ai.chatCalls()[1]?.inputs.messages as { role: string; content: string }[];
    expect(second.at(-1)?.content).toContain("Invalid arguments");
    expect(result.sources).toEqual([{ title: "Legal RAG assistant", href: "/work/legal-rag" }]);
  });

  it("survives an unknown tool and malformed arguments without crashing", async () => {
    const { result } = await agent(
      [
        {
          raw: {
            response: null,
            tool_calls: [
              { name: "drop_tables", arguments: {} },
              { name: "get_project", arguments: "{oops" },
            ],
          },
        },
        { text: "Sorry." },
      ],
      "hi",
    );
    expect(result.calls).toEqual([
      { name: "drop_tables", args: {}, ok: false, empty: true },
      { name: "get_project", args: "{oops", ok: false, empty: true },
    ]);
    expect(result.text).toBe(NO_ANSWER);
  });

  it("only cites links the tools returned, never URLs the model wrote", async () => {
    const { result } = await agent(
      [
        { calls: [{ name: "get_contact" }] },
        { text: "Email maiphh29@gmail.com, or see https://evil.example/phu." },
      ],
      "How do I reach him?",
    );
    expect(result.sources).toEqual([{ title: "Contact", href: "/#contact" }]);
  });

  it("falls back to the 8B model when the 70B call fails", async () => {
    const { result, ai } = await agent(
      [{ throws: "capacity" }, { calls: [{ name: "get_contact" }] }, { text: "Email him." }],
      "contact?",
    );
    expect(ai.chatCalls().map((c) => c.model)).toEqual([
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/meta/llama-3.1-8b-instruct",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    ]);
    expect(result.text).toBe("Email him.");
  });

  it("caps tool calls per round at 4", async () => {
    const many = Array.from({ length: 6 }, () => ({ name: "get_contact" }));
    const { result } = await agent([{ calls: many }, { text: "Email him." }], "contact?");
    expect(result.calls).toHaveLength(4);
  });
});

describe("parseReply", () => {
  it("reads both Workers AI tool-call shapes and Llama's leaked JSON", () => {
    expect(
      parseReply({ response: "", tool_calls: [{ name: "get_contact", arguments: {} }] }).calls[0]
        ?.name,
    ).toBe("get_contact");
    const oa = parseReply({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "c1",
                type: "function",
                function: { name: "get_project", arguments: '{"slug":"poet"}' },
              },
            ],
          },
        },
      ],
    });
    expect(oa.calls[0]).toEqual({ id: "c1", name: "get_project", args: '{"slug":"poet"}' });
    const leaked = parseReply({
      response: '<|python_tag|>{"name": "list_projects", "parameters": {}}',
    });
    expect(leaked.calls[0]?.name).toBe("list_projects");
    expect(leaked.text).toBe("");
    expect(parseReply({ response: '{"name": "not_a_tool"}' }).calls).toEqual([]);
  });

  it("needs no network for the site tools when the model doesn't call them", () => {
    const f = mockFetch();
    expect(f.seen).toHaveLength(0);
  });
});
