import type { Env } from "./env";

export const DEFAULT_CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const DEFAULT_FALLBACK_MODEL = "@cf/meta/llama-3.1-8b-instruct";
export const EMBED_MODEL = "@cf/baai/bge-m3";
export const EMBED_DIMS = 1024;

export const MAX_INPUT_CHARS = 500;
export const MAX_HISTORY_TURNS = 6;
export const MAX_HISTORY_CHARS = 2000;
export const MAX_BODY_BYTES = 32 * 1024;
export const MAX_TOKENS = 400;
export const TOP_K = 5;
/** Tool rounds per turn; after that the model must answer without tools. */
export const MAX_TOOL_ROUNDS = 3;
/** Tool calls run per round (the model may ask for several at once). */
export const MAX_CALLS_PER_ROUND = 4;
/** Characters of one tool result sent back to the model. */
export const MAX_TOOL_RESULT_CHARS = 6000;
export const SESSION_TTL_MS = 30 * 60_000;
export const VISITOR_WINDOW_MS = 10 * 60_000;
export const SITE_FETCH_TIMEOUT_MS = 5000;

const int = (v: string | undefined, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export interface Config {
  chatModel: string;
  fallbackModel: string;
  visitorLimit: number;
  dailyCap: number;
  minScore: number;
  origins: string[];
  siteUrl: string | null;
}

export function config(env: Env): Config {
  const score = Number.parseFloat(env.MIN_SCORE ?? "");
  return {
    chatModel: env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
    fallbackModel: env.CHAT_MODEL_FALLBACK || DEFAULT_FALLBACK_MODEL,
    visitorLimit: int(env.VISITOR_LIMIT, 10),
    dailyCap: int(env.DAILY_MESSAGE_CAP, 50),
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
