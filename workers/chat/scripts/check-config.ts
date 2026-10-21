/**
 * Fails (exit 1) if the wrangler.jsonc config for an environment still has placeholders.
 *
 *   node scripts/check-config.ts                    # top level (what plain `wrangler deploy` uses)
 *   node scripts/check-config.ts --env production   # env.production
 *
 * wrangler.jsonc runs it as `build.command`, so `wrangler deploy` (and `versions upload`) stop
 * before uploading. Under `wrangler dev` problems are printed but do not stop the dev server.
 */
import { readFile } from "node:fs/promises";
import { checkConfig, parseJsonc } from "./config-guard.ts";

const i = process.argv.indexOf("--env");
const env = i > 0 ? process.argv[i + 1] : undefined;
const config = parseJsonc(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const problems = checkConfig(config, env);
const where = env ? `env.${env}` : "top level";

if (problems.length === 0) {
  console.log(`wrangler.jsonc (${where}): no placeholders.`);
} else {
  console.error(`wrangler.jsonc (${where}) is not ready to deploy:`);
  for (const p of problems) console.error(`  - ${p}`);
  if (process.env.WRANGLER_COMMAND === "dev") console.error("(wrangler dev: continuing anyway)");
  else process.exit(1);
}
