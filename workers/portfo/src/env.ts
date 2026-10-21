import type { Quota } from "./quota";

/** The Workers Rate Limiting binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Only the Workers AI surface we use, so tests can pass a small fake. */
export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  AI: AiBinding;
  /** Burst guard at the edge (the binding only supports 10 s or 60 s periods). */
  CHAT_BURST_LIMITER: RateLimiter;
  /** Durable Object counters: per-visitor 10-minute window and the daily budget. */
  QUOTA: DurableObjectNamespace<Quota>;

  // Vars (wrangler.jsonc)
  /** Comma-separated origins allowed for browser CORS. */
  ALLOWED_ORIGINS?: string;
  /** "production" means a missing visitor salt fails closed. */
  ENVIRONMENT?: string;
  /** Workers AI model for chat + tool calling (an @cf/ id). */
  CHAT_MODEL?: string;
  /** Model tried when a CHAT_MODEL call fails (an @cf/ id). */
  CHAT_FALLBACK_MODEL?: string;
  /** Tool rounds per turn (1 to 5). */
  MAX_TOOL_ROUNDS?: string;
  /** max_tokens on every model call (64 to 2048). */
  MAX_TOKENS?: string;
  /** Messages per visitor per 10 minutes. */
  VISITOR_LIMIT?: string;
  /** Messages per day (Asia/Ho_Chi_Minh), across all visitors. */
  DAILY_MESSAGE_CAP?: string;

  // Secrets
  SESSION_SIGNING_KEY?: string;
  VISITOR_HASH_SALT?: string;
  RESEND_API_KEY?: string;
  NOTIFY_EMAIL?: string;
  RESEND_FROM?: string;
  GITHUB_TOKEN?: string;
  GITHUB_LOGIN?: string;
  CRON_SECRET?: string;
}

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export const consoleLogger: Logger = console;

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === "production";
}

export class ConfigError extends Error {
  override name = "ConfigError";
}
