/**
 * A small Postgres job queue on the `jobs` table.
 *
 * Workers claim with `FOR UPDATE SKIP LOCKED`, so several can run at once
 * without taking the same job. Each claim counts as an attempt. A failed job
 * goes back to the queue with exponential backoff until it runs out of
 * attempts, then stays `failed` with its last error.
 */
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "./client";
import { jobs, type Job } from "./schema";

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_BASE_DELAY_MS = 30_000;
export const DEFAULT_MAX_DELAY_MS = 60 * 60_000;

export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/** Delay before the next try after `attempts` tries: base * 2^(attempts - 1), capped. */
export function backoffMs(attempts: number, opts: BackoffOptions = {}): number {
  const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const max = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  return Math.min(base * 2 ** Math.max(attempts - 1, 0), max);
}

export interface EnqueueInput {
  type: string;
  payload?: unknown;
  /** Earliest time the job may run. Defaults to now. */
  runAfter?: Date;
}

export async function enqueue(db: Db, input: EnqueueInput): Promise<Job> {
  const [job] = await db
    .insert(jobs)
    .values({
      type: input.type,
      payload: input.payload ?? {},
      ...(input.runAfter ? { runAfter: input.runAfter } : {}),
    })
    .returning();
  if (!job) throw new Error("enqueue: insert returned no row");
  return job;
}

export interface ClaimOptions {
  /** Only claim these job types. Defaults to any type. */
  types?: string[];
  /** Maximum number of jobs to claim. Defaults to 1. */
  limit?: number;
}

/** Atomically claims due jobs: marks them `running` and counts the attempt. */
export async function claim(db: Db, opts: ClaimOptions = {}): Promise<Job[]> {
  const due = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "queued"),
        lte(jobs.runAfter, sql`now()`),
        opts.types?.length ? inArray(jobs.type, opts.types) : undefined,
      ),
    )
    .orderBy(asc(jobs.runAfter), asc(jobs.id))
    .limit(opts.limit ?? 1)
    .for("update", { skipLocked: true });

  return db
    .update(jobs)
    .set({ status: "running", attempts: sql`${jobs.attempts} + 1`, lockedAt: sql`now()` })
    .where(inArray(jobs.id, due))
    .returning();
}

export async function complete(db: Db, id: number): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "done", lockedAt: null, lastError: null })
    .where(and(eq(jobs.id, id), eq(jobs.status, "running")));
}

export interface FailOptions extends BackoffOptions {
  maxAttempts?: number;
}

/**
 * Records a failure. Re-queues the job with backoff, or marks it `failed`
 * once it has used `maxAttempts` attempts. Returns the updated job.
 */
export async function fail(
  db: Db,
  id: number,
  error: unknown,
  opts: FailOptions = {},
): Promise<Job | undefined> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const max = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const exhausted = sql`${jobs.attempts} >= ${maxAttempts}`;
  // Same formula as backoffMs, computed in SQL from the row's attempt count.
  const delayMs = sql`least(${base}::double precision * power(2, greatest(${jobs.attempts} - 1, 0)), ${max}::double precision)`;

  const [job] = await db
    .update(jobs)
    .set({
      status: sql`case when ${exhausted} then 'failed' else 'queued' end::job_status`,
      runAfter: sql`case when ${exhausted} then ${jobs.runAfter} else now() + ${delayMs} * interval '1 millisecond' end`,
      lastError: message,
      lockedAt: null,
    })
    .where(and(eq(jobs.id, id), eq(jobs.status, "running")))
    .returning();
  return job;
}

/** Puts `running` jobs whose worker vanished (locked longer than `staleMs`) back in the queue. */
export async function requeueStale(db: Db, staleMs: number): Promise<number> {
  const rows = await db
    .update(jobs)
    .set({ status: "queued", lockedAt: null })
    .where(
      and(
        eq(jobs.status, "running"),
        lte(jobs.lockedAt, sql`now() - ${staleMs} * interval '1 millisecond'`),
      ),
    )
    .returning({ id: jobs.id });
  return rows.length;
}
