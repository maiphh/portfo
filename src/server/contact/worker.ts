/**
 * The classify_and_notify worker: claims due jobs (FOR UPDATE SKIP LOCKED),
 * classifies the message, stores the result, and emails Phu unless it's spam.
 * Failures go back to the queue with backoff; after 5 attempts the job and the
 * message are marked failed. Steps already done are skipped on a retry.
 */
import { eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { claim, complete, DEFAULT_MAX_ATTEMPTS, fail, type BackoffOptions } from "~/db/queue";
import { contactMessages, type Job } from "~/db/schema";
import type { Logger } from "../env";
import type { Classifier } from "./classify";
import type { Notifier } from "./notify";
import { CONTACT_JOB, type ContactJobPayload } from "./submit";

export interface WorkerDeps {
  db: Db;
  classifier: Classifier;
  notifier: Notifier;
  log: Logger;
  maxAttempts?: number;
  backoff?: BackoffOptions;
}

export interface WorkerSummary {
  claimed: number;
  done: number;
  retried: number;
  failed: number;
}

function payloadOf(job: Job): ContactJobPayload {
  const p = job.payload as Partial<ContactJobPayload> | null;
  if (!p || typeof p.messageId !== "number") throw new Error(`job ${job.id}: bad payload`);
  return { messageId: p.messageId, ...(p.roleHint ? { roleHint: p.roleHint } : {}) };
}

async function handle(deps: WorkerDeps, job: Job): Promise<void> {
  const { db, classifier, notifier, log } = deps;
  const { messageId, roleHint } = payloadOf(job);
  const [msg] = await db.select().from(contactMessages).where(eq(contactMessages.id, messageId));
  if (!msg) throw new Error(`contact message ${messageId} not found`);

  let { category, confidence } = msg;
  if (!category) {
    const result = await classifier.classify({
      name: msg.name,
      email: msg.email,
      message: msg.body,
      roleHint,
    });
    ({ category, confidence } = result);
    await db
      .update(contactMessages)
      .set({ category, confidence, status: "classified" })
      .where(eq(contactMessages.id, messageId));
  }

  if (category === "spam") {
    log.info(`[worker] message ${messageId} is spam; stored, not emailed`);
    return;
  }
  if (msg.status === "notified") return;

  await notifier.notify({
    messageId,
    name: msg.name,
    email: msg.email,
    body: msg.body,
    category,
    confidence: confidence ?? 0,
    createdAt: msg.createdAt,
  });
  await db
    .update(contactMessages)
    .set({ status: "notified" })
    .where(eq(contactMessages.id, messageId));
}

/** Claims and processes up to `limit` due contact jobs, one at a time. */
export async function runContactJobs(deps: WorkerDeps, limit = 5): Promise<WorkerSummary> {
  const { db, log } = deps;
  const summary: WorkerSummary = { claimed: 0, done: 0, retried: 0, failed: 0 };
  const jobs = await claim(db, { types: [CONTACT_JOB], limit });
  summary.claimed = jobs.length;

  for (const job of jobs) {
    try {
      await handle(deps, job);
      await complete(db, job.id);
      summary.done++;
    } catch (err) {
      const row = await fail(db, job.id, err, {
        maxAttempts: deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        ...deps.backoff,
      });
      if (row?.status === "failed") {
        summary.failed++;
        log.error(`[worker] job ${job.id} failed after ${row.attempts} attempts`, err);
        const messageId = (job.payload as Partial<ContactJobPayload> | null)?.messageId;
        if (typeof messageId === "number") {
          await db
            .update(contactMessages)
            .set({ status: "failed" })
            .where(eq(contactMessages.id, messageId));
        }
      } else {
        summary.retried++;
        log.warn(`[worker] job ${job.id} attempt ${job.attempts} failed; retrying later`, err);
      }
    }
  }
  return summary;
}
