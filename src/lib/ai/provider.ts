/**
 * Provider-swappable LLM + embedding models through the Vercel AI SDK.
 *
 * Server-only. Nothing imports this yet and no request is made here: creating a
 * model object does not call the provider. The /api/chat and worker PRs will use
 * `getChatModel()` / `getEmbeddingModel()` with `streamText`, `generateObject`
 * and `embed` from "ai".
 *
 * Gemini is the default (free tier); set AI_PROVIDER=openai to switch.
 * The embedding dimension must match the `chunks.embedding` column (1536).
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel } from "ai";

export type AiProviderName = "google" | "openai";

export interface AiConfig {
  provider: AiProviderName;
  chatModel: string;
  /** Small, cheap model for classifying contact messages. */
  classifyModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
}

const DEFAULTS: Record<AiProviderName, Omit<AiConfig, "provider">> = {
  google: {
    chatModel: "gemini-2.5-flash",
    classifyModel: "gemini-2.5-flash-lite",
    embeddingModel: "gemini-embedding-001",
    embeddingDimensions: 1536,
  },
  openai: {
    chatModel: "gpt-4o-mini",
    classifyModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 1536,
  },
};

type Env = Record<string, string | undefined>;

export function getAiConfig(env: Env = process.env): AiConfig {
  const provider: AiProviderName = env.AI_PROVIDER === "openai" ? "openai" : "google";
  return { provider, ...DEFAULTS[provider] };
}

function requireKey(env: Env, name: string): string {
  const key = env[name];
  if (!key)
    throw new Error(`${name} is not set. Add it to the Vercel project env (see .env.example).`);
  return key;
}

function providerFor(env: Env, config: AiConfig) {
  return config.provider === "openai"
    ? createOpenAI({ apiKey: requireKey(env, "OPENAI_API_KEY") })
    : createGoogleGenerativeAI({ apiKey: requireKey(env, "GEMINI_API_KEY") });
}

export function getChatModel(
  env: Env = process.env,
  purpose: "chat" | "classify" = "chat",
): LanguageModel {
  const config = getAiConfig(env);
  const p = providerFor(env, config);
  return p(purpose === "chat" ? config.chatModel : config.classifyModel);
}

export function getEmbeddingModel(env: Env = process.env): EmbeddingModel {
  const config = getAiConfig(env);
  return providerFor(env, config).embedding(config.embeddingModel);
}
