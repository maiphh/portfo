/**
 * /api/cron/jobs core: Bearer CRON_SECRET auth, then re-queue stuck jobs and
 * process pending ones. Fails closed when CRON_SECRET is not set.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { requeueStale } from "~/db/queue";
import type { Env } from "./env";
import { runContactJobs, type WorkerDeps } from "./contact/worker";

/** A job still `running` after this long lost its worker. */
export const STALE_JOB_MS = 10 * 60_000;

const digest = (s: string) => createHash("sha256").update(s).digest();

export function isAuthorized(header: string | null, secret: string): boolean {
  if (!header) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

export async function handleCronJobs(
  request: Request,
  env: Env,
  deps: () => WorkerDeps,
): Promise<Response> {
  const secret = env.CRON_SECRET;
  const headers = { "Cache-Control": "no-store" };
  if (!secret) {
    return Response.json({ ok: false, error: "cron_not_configured" }, { status: 503, headers });
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }
  const workerDeps = deps();
  const requeued = await requeueStale(workerDeps.db, STALE_JOB_MS);
  const jobs = await runContactJobs(workerDeps, 25);
  return Response.json({ ok: true, requeued, jobs }, { headers });
}
