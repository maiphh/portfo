import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_FALLBACK_MODEL,
  config,
  intKnob,
  KNOBS,
  modelKnob,
} from "../src/config";
import { call, fakeAi, fakeVectorize, talentnetMatch, testEnv } from "./helpers";

describe("runtime knobs (wrangler.jsonc vars)", () => {
  it("uses the defaults when the vars are missing", () => {
    const cfg = config(
      testEnv({
        CHAT_MODEL: undefined,
        CHAT_FALLBACK_MODEL: undefined,
        DAILY_MESSAGE_CAP: undefined,
        VISITOR_LIMIT: undefined,
        MAX_TOOL_ROUNDS: undefined,
        MAX_TOKENS: undefined,
      }),
    );
    expect(cfg).toMatchObject({
      chatModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      fallbackModel: "@cf/meta/llama-3.1-8b-instruct",
      dailyCap: 50,
      visitorLimit: 10,
      maxToolRounds: 3,
      maxTokens: 400,
    });
  });

  it("picks up valid overrides", () => {
    const cfg = config(
      testEnv({
        CHAT_MODEL: "@cf/meta/llama-3.1-8b-instruct",
        CHAT_FALLBACK_MODEL: "@cf/meta/llama-3.2-3b-instruct",
        DAILY_MESSAGE_CAP: "20",
        VISITOR_LIMIT: " 5 ",
        MAX_TOOL_ROUNDS: "2",
        MAX_TOKENS: "256",
      }),
    );
    expect(cfg).toMatchObject({
      chatModel: "@cf/meta/llama-3.1-8b-instruct",
      fallbackModel: "@cf/meta/llama-3.2-3b-instruct",
      dailyCap: 20,
      visitorLimit: 5,
      maxToolRounds: 2,
      maxTokens: 256,
    });
  });

  it("falls back to the default for invalid numbers", () => {
    for (const bad of ["", "  ", "abc", "12abc", "1e3", "3.5", "0x10", "NaN", "Infinity"])
      expect(intKnob(bad, KNOBS.DAILY_MESSAGE_CAP), bad).toBe(50);
    const cfg = config(
      testEnv({
        DAILY_MESSAGE_CAP: "lots",
        VISITOR_LIMIT: "-",
        MAX_TOOL_ROUNDS: "two",
        MAX_TOKENS: "4k",
      }),
    );
    expect([cfg.dailyCap, cfg.visitorLimit, cfg.maxToolRounds, cfg.maxTokens]).toEqual([
      50, 10, 3, 400,
    ]);
  });

  it("clamps numbers to their ranges", () => {
    const hi = config(
      testEnv({
        DAILY_MESSAGE_CAP: "999999",
        VISITOR_LIMIT: "5000",
        MAX_TOOL_ROUNDS: "50",
        MAX_TOKENS: "99999999999999999999",
      }),
    );
    expect([hi.dailyCap, hi.visitorLimit, hi.maxToolRounds, hi.maxTokens]).toEqual([
      1000, 100, 5, 2048,
    ]);
    const lo = config(
      testEnv({
        DAILY_MESSAGE_CAP: "0",
        VISITOR_LIMIT: "-3",
        MAX_TOOL_ROUNDS: "0",
        MAX_TOKENS: "1",
      }),
    );
    expect([lo.dailyCap, lo.visitorLimit, lo.maxToolRounds, lo.maxTokens]).toEqual([1, 1, 1, 64]);
  });

  it("allows only @cf/ model ids", () => {
    for (const bad of [
      "",
      "gpt-4o",
      "openai/gpt-4o",
      "@hf/thebloke/mistral-7b",
      "https://evil.example/@cf/meta/x",
      "@cf/meta",
      "@cf/meta/llama 3",
      "@cf//x",
      `@cf/meta/${"x".repeat(120)}`,
    ]) {
      expect(modelKnob(bad, DEFAULT_CHAT_MODEL), bad).toBe(DEFAULT_CHAT_MODEL);
    }
    const cfg = config(testEnv({ CHAT_MODEL: "llama-70b", CHAT_FALLBACK_MODEL: "@hf/x/y" }));
    expect(cfg.chatModel).toBe(DEFAULT_CHAT_MODEL);
    expect(cfg.fallbackModel).toBe(DEFAULT_FALLBACK_MODEL);
  });

  it("the agent uses the overridden model, max_tokens and tool rounds", async () => {
    const ai = fakeAi((inputs) =>
      inputs.tools ? { calls: [{ name: "list_projects" }] } : { text: "Six projects." },
    );
    const env = testEnv({
      AI: ai.ai,
      VECTORIZE: fakeVectorize([talentnetMatch]).index,
      CHAT_MODEL: "@cf/meta/llama-3.1-8b-instruct",
      MAX_TOOL_ROUNDS: "1",
      MAX_TOKENS: "200",
    });
    const cfg = config(env);
    const result = await runAgent({
      ai: ai.ai,
      cfg,
      history: [{ role: "user", content: "Tell me everything" }],
      ctx: { env, cfg },
      emit: () => {},
    });
    const chat = ai.chatCalls();
    expect(result.rounds).toBe(1);
    expect(chat).toHaveLength(2);
    expect(chat.every((c) => c.model === "@cf/meta/llama-3.1-8b-instruct")).toBe(true);
    expect(chat.every((c) => c.inputs.max_tokens === 200)).toBe(true);
    expect(JSON.stringify(chat[0]?.inputs.messages)).toContain("at most 1 round of tool calls");
    expect(JSON.stringify(chat[1]?.inputs.messages)).toContain("You have used all 1 tool round.");
  });

  it("/health reports the active values", async () => {
    const env = testEnv({
      CHAT_MODEL: "@cf/meta/llama-3.1-8b-instruct",
      CHAT_FALLBACK_MODEL: "not-a-model",
      DAILY_MESSAGE_CAP: "25",
      VISITOR_LIMIT: "4",
      MAX_TOOL_ROUNDS: "2",
      MAX_TOKENS: "9000",
    });
    const { res, text } = await call(new Request("https://chat.test/health"), env);
    expect(res.status).toBe(200);
    const body = JSON.parse(text);
    expect(body.models).toMatchObject({
      chat: "@cf/meta/llama-3.1-8b-instruct",
      fallback: DEFAULT_FALLBACK_MODEL,
    });
    expect(body.limits).toMatchObject({
      dailyMessages: 25,
      perVisitorPer10Min: 4,
      toolRounds: 2,
      maxTokens: 2048,
    });
    expect(text).not.toContain("test-session-key");
    expect(text).not.toContain("test-turnstile-secret");
  });
});
