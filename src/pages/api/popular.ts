import type { APIRoute } from "astro";
import { getDb } from "~/db/client";
import { getWork } from "~/lib/work";
import { getPopular, POPULAR_CACHE_CONTROL, type WorkRef } from "~/server/analytics/popular";
import { consoleLogger as log } from "~/server/env";

/** GET /api/popular: most-read case studies, last 7 days. Edge-cached ~30 s. */
export const prerender = false;

let work: WorkRef[] | undefined;

export const GET: APIRoute = async () => {
  try {
    work ??= (await getWork()).map((w) => ({
      slug: w.id,
      title: w.data.title,
      href: `/#${w.data.anchor}`,
    }));
    const result = await getPopular(getDb(), work);
    return Response.json(result, { headers: { "Cache-Control": POPULAR_CACHE_CONTROL } });
  } catch (err) {
    log.error("[popular] unavailable", err);
    return Response.json(
      { items: [], error: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
};
