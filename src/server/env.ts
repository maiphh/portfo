/** Server-side environment helpers. Never import from client code. */
export type Env = Record<string, string | undefined>;

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export const consoleLogger: Logger = console;

/** True on a production deployment, where missing security config must fail closed. */
export function isProduction(env: Env): boolean {
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

/** Thrown when required configuration is missing in production. */
export class ConfigError extends Error {
  override name = "ConfigError";
}
