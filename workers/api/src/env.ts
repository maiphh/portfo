export interface Env {
  DB: D1Database;

  // Vars (wrangler.jsonc)
  /** Comma-separated origins allowed for browser CORS. */
  ALLOWED_ORIGINS?: string;
  /** "production" means a missing visitor salt fails closed. */
  ENVIRONMENT?: string;

  // Secrets
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
