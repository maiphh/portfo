import type { APIRoute } from "astro";
import { productionWorkerDeps } from "~/server/contact/deps";
import { handleCronJobs } from "~/server/cron";

/**
 * Sweeper: re-queues stuck jobs and processes pending ones. Needs
 * `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it automatically).
 * Scheduled daily in vercel.json as a fallback; the contact endpoint kicks the
 * worker right away, so this only catches what that missed.
 */
export const prerender = false;

const run: APIRoute = ({ request }) =>
  handleCronJobs(request, process.env, () => productionWorkerDeps());

export const GET = run;
export const POST = run;
