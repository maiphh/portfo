import type { Quota } from "./quota";

/** The Workers Rate Limiting binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Only the Workers AI surface we use, so tests can pass a small fake. */
export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

/** Only the Vectorize surface we use. */
export interface VectorIndex {
  query(
    vector: number[],
    options: { topK: number; returnMetadata: "all" | "indexed" | "none" },
  ): Promise<{ matches: { id: string; score: number; metadata?: Record<string, unknown> }[] }>;
  upsert(
    vectors: { id: string; values: number[]; metadata?: Record<string, unknown> }[],
  ): Promise<unknown>;
  deleteByIds(ids: string[]): Promise<unknown>;
  getByIds(ids: string[]): Promise<{ id: string; metadata?: Record<string, unknown> }[]>;
}

export interface Env {
  AI: AiBinding;
  VECTORIZE: VectorIndex;
  /** Burst guard at the edge (the binding only supports 10 s or 60 s periods). */
  CHAT_BURST_LIMITER: RateLimiter;
  /** Durable Object counters: per-visitor 10-minute window and the daily budget. */
  QUOTA: DurableObjectNamespace<Quota>;

  // Secrets (wrangler secret put …)
  INGEST_SECRET?: string;
  SESSION_SIGNING_KEY?: string;

  // Vars (wrangler.jsonc "vars")
  /** Comma-separated origins allowed to call /chat, e.g. "https://maiphh.dev,http://localhost:4321". */
  ALLOWED_ORIGINS?: string;
  /** Origin of portfo-api (no trailing slash), for /activity and /popular. */
  API_URL?: string;
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
  /** Minimum cosine score for a Vectorize match to count. */
  MIN_SCORE?: string;
}
