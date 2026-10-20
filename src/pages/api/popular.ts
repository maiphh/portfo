import type { APIRoute } from "astro";
import { getDb } from "~/db/client";
import { getWork } from "~/lib/work";
import {
  getPopular,
  parseDays,
  POPULAR_CACHE_CONTROL,
  type WorkRef,
} from "~/server/analytics/popular";
import { consoleLogger as log } from "~/server/env";

/** GET /api/popular[?days=1..30]: most-read case studies, last 7 days by default. Edge-cached ~30 s. */
export const prerender = false;

let work: WorkRef[] | undefined;

export const GET: APIRoute = async ({ url }) => {
  try {
    work ??= (await getWork()).map((w) => ({
      slug: w.id,
      title: w.data.title,
      href: `/#${w.data.anchor}`,
    }));
    const result = await getPopular(getDb(), work, {
      days: parseDays(url.searchParams.get("days")),
    });
    return Response.json(result, { headers: { "Cache-Control": POPULAR_CACHE_CONTROL } });
  } catch (err) {
    log.error("[popular] unavailable", err);
    return Response.json(
      { items: [], error: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
};
