/**
 * A local stand-in for the Worker's stream, with the same events and failure modes.
 * `scenario` forces a failure for tests and screenshots (`?chat-mock=rate_limited`, only in mock mode).
 */
import { pickMockReply } from "~/lib/mocks/chat";
import { ChatHttpError } from "./client";
import type { ChatEvent } from "./sse";

export type MockScenario = "ok" | "rate_limited" | "daily_limit" | "network" | "upstream" | "slow";

export const MOCK_SCENARIOS: readonly MockScenario[] = [
  "ok",
  "rate_limited",
  "daily_limit",
  "network",
  "upstream",
  "slow",
];

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function* mockStream(
  question: string,
  opts: {
    signal?: AbortSignal;
    scenario?: MockScenario;
    speed?: number;
    newSession?: boolean;
  } = {},
): AsyncGenerator<ChatEvent> {
  const k = opts.speed ?? 1;
  const scenario = opts.scenario ?? "ok";
  const reply = pickMockReply(question);
  await wait(250 * k, opts.signal);
  if (scenario === "network") throw new ChatHttpError("network");
  if (scenario === "rate_limited")
    throw new ChatHttpError("rate_limited", 429, 420, "That's a lot of questions.");
  if (scenario === "daily_limit") throw new ChatHttpError("daily_limit", 429);
  if (opts.newSession)
    yield { type: "session", token: "mock-session", expiresAt: Date.now() + 30 * 60_000 };
  for (const [i, s] of reply.steps.entries()) {
    yield { type: "status", tool: s.tool, label: s.label, round: i + 1 };
    await wait((scenario === "slow" ? 1600 : 650) * k, opts.signal);
  }
  if (scenario === "upstream") {
    yield {
      type: "error",
      error: "upstream_error",
      message: "The assistant is unavailable right now. Try again soon.",
    };
    yield { type: "sources", sources: [] };
    return;
  }
  const words = reply.answer.match(/\S+\s*/g) ?? [];
  for (let i = 0; i < words.length; i += 2) {
    yield { type: "token", text: words.slice(i, i + 2).join("") };
    await wait((scenario === "slow" ? 160 : 45) * k, opts.signal);
  }
  yield { type: "sources", sources: reply.sources };
  yield { type: "done", rounds: reply.steps.length + 1, model: "mock" };
}
