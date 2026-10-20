import type { Env } from "./env";

export const DEFAULT_CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const DEFAULT_FALLBACK_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const EMBED_MODEL = "@cf/baai/bge-m3";
export const EMBED_DIMS = 1024;

export const MAX_INPUT_CHARS = 500;
export const MAX_HISTORY_TURNS = 6;
export const MAX_HISTORY_CHARS = 2000;
export const MAX_BODY_BYTES = 32 * 1024;
export const TOP_K = 5;
/** Tool calls run per round (the model may ask for several at once). */
export const MAX_CALLS_PER_ROUND = 4;
/** Characters of one tool result sent back to the model. */
export const MAX_TOOL_RESULT_CHARS = 6000;
export const SESSION_TTL_MS = 30 * 60_000;
export const VISITOR_WINDOW_MS = 10 * 60_000;
export const SITE_FETCH_TIMEOUT_MS = 5000;

/**
 * Runtime knobs: plain wrangler.jsonc vars, validated on every request. A missing or invalid
 * value falls back to its default; a number outside its range is clamped to the range.
 */
export const KNOBS = {
  DAILY_MESSAGE_CAP: { default: 50, min: 1, max: 1000 },
  VISITOR_LIMIT: { default: 10, min: 1, max: 100 },
  MAX_TOOL_ROUNDS: { default: 3, min: 1, max: 5 },
  MAX_TOKENS: { default: 400, min: 64, max: 2048 },
} as const;

/** Tool rounds per turn by default; after the last round the model must answer without tools. */
export const MAX_TOOL_ROUNDS = KNOBS.MAX_TOOL_ROUNDS.default;
export const MAX_TOKENS = KNOBS.MAX_TOKENS.default;

/** Whole numbers only ("12", not "12abc" or "1e3"), clamped to [min, max]. */
export function intKnob(
  v: string | undefined,
  k: { default: number; min: number; max: number },
): number {
  const raw = (v ?? "").trim();
  if (!/^-?\d+$/.test(raw)) return k.default;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return n > 0 ? k.max : k.min;
  return Math.min(k.max, Math.max(k.min, n));
}

/** Only Workers AI catalogue ids, e.g. "@cf/meta/llama-3.1-8b-instruct". */
const MODEL_ID = /^@cf\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i;

export function modelKnob(v: string | undefined, fallback: string): string {
  const raw = (v ?? "").trim();
  return raw.length <= 100 && MODEL_ID.test(raw) ? raw : fallback;
}

export interface Config {
  chatModel: string;
  fallbackModel: string;
  visitorLimit: number;
  dailyCap: number;
  maxToolRounds: number;
  maxTokens: number;
  minScore: number;
  origins: string[];
  siteUrl: string | null;
}

export function config(env: Env): Config {
  const score = Number.parseFloat(env.MIN_SCORE ?? "");
  return {
    chatModel: modelKnob(env.CHAT_MODEL, DEFAULT_CHAT_MODEL),
    fallbackModel: modelKnob(env.CHAT_FALLBACK_MODEL, DEFAULT_FALLBACK_MODEL),
    visitorLimit: intKnob(env.VISITOR_LIMIT, KNOBS.VISITOR_LIMIT),
    dailyCap: intKnob(env.DAILY_MESSAGE_CAP, KNOBS.DAILY_MESSAGE_CAP),
    maxToolRounds: intKnob(env.MAX_TOOL_ROUNDS, KNOBS.MAX_TOOL_ROUNDS),
    maxTokens: intKnob(env.MAX_TOKENS, KNOBS.MAX_TOKENS),
    minScore: Number.isFinite(score) ? score : 0.35,
    origins: (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean),
    siteUrl: env.SITE_URL ? env.SITE_URL.replace(/\/$/, "") : null,
  };
}

/** The calendar day in Ho Chi Minh City (UTC+7, no DST), e.g. "2026-10-20". */
export function saigonDay(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}
