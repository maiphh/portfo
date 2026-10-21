/**
 * Deploy guard for wrangler.jsonc: no var or binding value may still be a placeholder.
 * Pure functions (no fs) so the Worker tests can import them; the CLI is check-config.ts.
 */

/** Matches REPLACE_ME, REPLACE_ME_SITE_DOMAIN, replace-me… */
export const PLACEHOLDER = /replace[_-]?me/i;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type WranglerConfig = { [k: string]: Json };

/** JSON with comments and trailing commas (what wrangler.jsonc allows) to a value. */
export function parseJsonc(text: string): WranglerConfig {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) throw new Error("Unclosed /* comment");
      i++;
    } else if (c === "}" || c === "]") {
      out = out.replace(/,\s*$/, "") + c;
    } else out += c;
  }
  return JSON.parse(out) as WranglerConfig;
}

/**
 * The config wrangler uses for `env` (or the top level): the env's keys replace the
 * top-level ones. Non-inheritable keys such as `vars` are not merged, matching wrangler.
 */
export function effectiveConfig(config: WranglerConfig, env?: string): WranglerConfig {
  const { env: envs, ...top } = config;
  if (!env) return top;
  const section = (envs as Record<string, WranglerConfig> | undefined)?.[env];
  if (!section) throw new Error(`wrangler.jsonc has no env.${env}`);
  return { ...top, ...section };
}

function walk(v: Json, path: string, out: { path: string; value: string }[]): void {
  if (typeof v === "string") out.push({ path, value: v });
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, out);
}

/** Problems that must block a deploy of `env` (top level when omitted). Empty means OK. */
export function checkConfig(config: WranglerConfig, env?: string): string[] {
  const eff = effectiveConfig(config, env);
  const strings: { path: string; value: string }[] = [];
  walk(eff, "", strings);
  const problems = strings
    .filter((s) => PLACEHOLDER.test(s.value))
    .map((s) => `${s.path} is still a placeholder ("${s.value}")`);

  if (env === "production") {
    const vars = (eff.vars ?? {}) as Record<string, Json>;
    const origins = typeof vars.ALLOWED_ORIGINS === "string" ? vars.ALLOWED_ORIGINS : "";
    if (!origins.split(",").some((o) => /^https:\/\//.test(o.trim())))
      problems.push("vars.ALLOWED_ORIGINS must include the https:// production origin");
    if (vars.ENVIRONMENT !== "production") problems.push('vars.ENVIRONMENT must be "production"');
  }
  return [...new Set(problems)];
}
