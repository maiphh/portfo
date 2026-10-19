import type { APIRoute } from "astro";
import { getDb } from "~/db/client";
import { productionWorkerDeps } from "~/server/contact/deps";
import { BodyTooLargeError, clientIp, readBody } from "~/server/contact/request";
import { toResponse, wantsJson } from "~/server/contact/respond";
import { submitContact } from "~/server/contact/submit";
import { runContactJobs } from "~/server/contact/worker";
import { consoleLogger as log } from "~/server/env";
import { kick } from "~/server/kick";

/** POST /api/contact: on-demand Vercel function. See src/server/contact/submit.ts. */
export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const json = wantsJson(request);
  try {
    const raw = await readBody(request);
    const result = await submitContact(
      raw,
      {
        ip: clientIp(request, () => clientAddress),
        userAgent: request.headers.get("user-agent") ?? "",
      },
      { db: getDb(), env: process.env, log },
    );
    if (result.kind === "accepted") {
      // Start the worker now; the response doesn't wait for it.
      void kick(() => runContactJobs(productionWorkerDeps(), 3), log);
    }
    return toResponse(result, json);
  } catch (err) {
    if (err instanceof BodyTooLargeError) return toResponse({ kind: "too_large" }, json);
    log.error("[contact] unexpected error", err);
    return toResponse({ kind: "error" }, json);
  }
};
