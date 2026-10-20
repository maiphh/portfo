/**
 * The agent loop: Workers AI function calling with at most MAX_TOOL_ROUNDS tool rounds,
 * then a forced final answer without tools. Enforced in code, not just in the prompt:
 *   - sources are only the links the tools actually returned (never model-written URLs);
 *   - no tool data means the fixed "I don't know" answer (also covers off-topic requests);
 *   - bad tool names or arguments come back to the model as tool errors, never a crash.
 */
import {
  MAX_CALLS_PER_ROUND,
  MAX_TOKENS,
  MAX_TOOL_RESULT_CHARS,
  MAX_TOOL_ROUNDS,
  type Config,
} from "./config";
import type { AiBinding } from "./env";
import { FORCE_ANSWER, NO_ANSWER, SYSTEM_PROMPT } from "./prompt";
import { getTool, runTool, toolDefinitions, type Source, type ToolContext } from "./tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AgentEvent =
  { type: "status"; tool: string; label: string; round: number } | { type: "token"; text: string };

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface AgentResult {
  text: string;
  sources: Source[];
  rounds: number;
  calls: { name: string; args: unknown; ok: boolean; empty: boolean }[];
  model: string;
  answered: boolean;
}

type ModelMessage = Record<string, unknown>;

interface ModelReply {
  text: string;
  calls: ToolCall[];
}

let seq = 0;
const callId = () => `call_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/** Accepts both Workers AI shapes: `{ name, arguments }` and OpenAI-style `{ id, function: { name, arguments } }`. */
export function parseReply(raw: unknown): ModelReply {
  const r = (raw ?? {}) as Record<string, unknown>;
  const choice = (r.choices as { message?: Record<string, unknown> }[] | undefined)?.[0]?.message;
  const src = choice ?? r;
  const rawCalls = (src.tool_calls ?? []) as Record<string, unknown>[];
  const calls: ToolCall[] = [];
  for (const c of Array.isArray(rawCalls) ? rawCalls : []) {
    const fn = (c.function ?? c) as Record<string, unknown>;
    if (typeof fn.name !== "string") continue;
    calls.push({
      id: typeof c.id === "string" ? c.id : callId(),
      name: fn.name,
      args: fn.arguments ?? fn.parameters ?? {},
    });
  }
  const content = src.response ?? src.content;
  let text = typeof content === "string" ? content : content == null ? "" : JSON.stringify(content);
  // Llama sometimes writes the call as JSON text instead of using tool_calls.
  if (!calls.length) {
    const leaked = leakedCall(text);
    if (leaked) {
      calls.push(leaked);
      text = "";
    }
  }
  return { text: text.trim(), calls };
}

function leakedCall(text: string): ToolCall | null {
  const t = text.trim().replace(/^<\|python_tag\|>/, "");
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  try {
    const j = JSON.parse(t) as { name?: unknown; parameters?: unknown; arguments?: unknown };
    if (typeof j.name === "string" && getTool(j.name))
      return { id: callId(), name: j.name, args: j.parameters ?? j.arguments ?? {} };
  } catch {
    /* not a call */
  }
  return null;
}

async function callModel(
  ai: AiBinding,
  cfg: Config,
  messages: ModelMessage[],
  withTools: boolean,
): Promise<{ reply: ModelReply; model: string }> {
  const inputs: Record<string, unknown> = {
    messages: [...messages],
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
  };
  if (withTools) inputs.tools = toolDefinitions();
  try {
    return { reply: parseReply(await ai.run(cfg.chatModel, inputs)), model: cfg.chatModel };
  } catch (err) {
    if (cfg.fallbackModel === cfg.chatModel) throw err;
    return { reply: parseReply(await ai.run(cfg.fallbackModel, inputs)), model: cfg.fallbackModel };
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…[truncated]` : s);

/** Emits the text as small token events, so the window renders it progressively. */
function emitText(text: string, emit: (e: AgentEvent) => void) {
  const parts = text.match(/\S+\s*/g) ?? [text];
  for (let i = 0; i < parts.length; i += 3)
    emit({ type: "token", text: parts.slice(i, i + 3).join("") });
}

export async function runAgent(opts: {
  ai: AiBinding;
  cfg: Config;
  history: ChatMessage[];
  ctx: ToolContext;
  emit: (e: AgentEvent) => void;
}): Promise<AgentResult> {
  const { ai, cfg, emit } = opts;
  const messages: ModelMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...opts.history];
  const cited = new Map<string, Source>();
  const calls: AgentResult["calls"] = [];
  let anyData = false;
  let text = "";
  let model = cfg.chatModel;
  let rounds = 0;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const forced = round === MAX_TOOL_ROUNDS;
    if (forced) messages.push({ role: "system", content: FORCE_ANSWER });
    const out = await callModel(ai, cfg, messages, !forced);
    model = out.model;
    const wanted = forced ? [] : out.reply.calls.slice(0, MAX_CALLS_PER_ROUND);
    if (!wanted.length) {
      text = out.reply.text;
      break;
    }
    rounds++;
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: wanted.map((c) => ({
        id: c.id,
        type: "function",
        function: {
          name: c.name,
          arguments: typeof c.args === "string" ? c.args : JSON.stringify(c.args ?? {}),
        },
      })),
    });
    for (const c of wanted) {
      emit({
        type: "status",
        tool: c.name,
        label: getTool(c.name)?.label ?? "Thinking…",
        round: rounds,
      });
      const o = await runTool(c.name, c.args, opts.ctx);
      const empty = o.ok ? o.result.empty : true;
      calls.push({ name: c.name, args: c.args, ok: o.ok, empty });
      if (o.ok && !o.result.empty) {
        anyData = true;
        for (const s of o.result.sources) if (!cited.has(s.href)) cited.set(s.href, s);
      }
      const content = o.ok
        ? JSON.stringify(
            o.result.empty ? { result: o.result.data, note: "Nothing found." } : o.result.data,
          )
        : JSON.stringify({ error: o.error });
      messages.push({
        role: "tool",
        tool_call_id: c.id,
        name: c.name,
        content: clip(content, MAX_TOOL_RESULT_CHARS),
      });
    }
  }

  const dontKnow = !anyData || !text || /^i don['’]t know\b/i.test(text);
  const finalText = !anyData || !text ? NO_ANSWER : text;
  emitText(finalText, emit);
  return {
    text: finalText,
    sources: dontKnow ? [] : [...cited.values()],
    rounds,
    calls,
    model,
    answered: !dontKnow,
  };
}
