import type { APIRoute } from "astro";
import { getDb } from "~/db/client";
import { site } from "~/lib/site";
import { consoleLogger as log } from "~/server/env";
import { handleGithubSync } from "~/server/github/handler";
import { createGraphqlProvider } from "~/server/github/provider";

/**
 * GitHub sync. Needs `Authorization: Bearer $CRON_SECRET`. Called every 6 hours by
 * .github/workflows/github-sync.yml, with a daily Vercel Cron fallback in vercel.json.
 */
export const prerender = false;

const run: APIRoute = ({ request }) =>
  handleGithubSync(request, process.env, () => {
    const token = process.env.GITHUB_TOKEN;
    return {
      db: getDb(),
      provider: token ? createGraphqlProvider({ token }) : null,
      log,
      login: process.env.GITHUB_LOGIN || site.githubHandle,
    };
  });

export const GET = run;
export const POST = run;
