/**
 * Runs background work after the response is sent. On Vercel this uses
 * waitUntil from @vercel/functions; elsewhere (local dev, tests) the promise
 * simply runs fire-and-forget. Errors are logged, never thrown.
 */
import { waitUntil } from "@vercel/functions";
import type { Logger } from "./env";

export function kick(task: () => Promise<unknown>, log: Logger): Promise<void> {
  const promise = Promise.resolve()
    .then(task)
    .then(
      () => undefined,
      (err: unknown) => log.error("[kick] background task failed", err),
    );
  try {
    waitUntil(promise);
  } catch {
    // Not on Vercel: the promise keeps running on its own (fire-and-forget).
  }
  return promise;
}
