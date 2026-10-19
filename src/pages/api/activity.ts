import type { APIRoute } from "astro";
import { getDb } from "~/db/client";
import { site } from "~/lib/site";
import { consoleLogger as log } from "~/server/env";
import { ACTIVITY_CACHE_CONTROL, getActivity } from "~/server/github/activity";

/** GET /api/activity: synced GitHub activity for the home page. Edge-cached ~60 s. */
export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const payload = await getActivity(getDb(), { login: site.githubHandle });
    return Response.json(payload, { headers: { "Cache-Control": ACTIVITY_CACHE_CONTROL } });
  } catch (err) {
    log.error("[activity] unavailable", err);
    return Response.json(
      { status: "unavailable", summary: null, repos: [] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
};
