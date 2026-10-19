import type { APIRoute } from "astro";
import { getDb } from "~/db/client";
import { getWork } from "~/lib/work";
import { readViewBody, recordView, viewResponse } from "~/server/analytics/view";
import { clientIp } from "~/server/contact/request";
import { consoleLogger as log } from "~/server/env";

/** POST /api/view: page-view beacon. See src/server/analytics/view.ts. */
export const prerender = false;

let slugs: Set<string> | undefined;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    slugs ??= new Set((await getWork()).map((w) => w.id));
    const result = await recordView(
      await readViewBody(request),
      {
        ip: clientIp(request, () => clientAddress),
        userAgent: request.headers.get("user-agent") ?? "",
      },
      { db: getDb(), env: process.env, log, knownSlugs: slugs },
    );
    return viewResponse(result);
  } catch (err) {
    log.error("[view] unexpected error", err);
    return Response.json(
      { ok: false, error: "error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
