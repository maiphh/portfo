import type { Env } from "./env";

export interface Config {
  origins: string[];
  /** First allowed origin, used as the "Back to the site" link on HTML contact responses. */
  siteOrigin: string | null;
  login: string;
}

export function config(env: Env): Config {
  const origins = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return {
    origins,
    siteOrigin: origins[0] ?? null,
    login: (env.GITHUB_LOGIN ?? "maiphh").trim() || "maiphh",
  };
}
