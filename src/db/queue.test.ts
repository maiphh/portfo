import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connect, rows, truncate } from "../../test/db";
import { backoffMs, claim, complete, enqueue, fail, requeueStale } from "./queue";
import { jobs } from "./schema";

const h = connect();
const db = h.db;
afterAll(() => h.close());
beforeEach(() => truncate(h, "jobs"));

async function dbNow(): Promise<number> {
  const result = await rows<{ now: string }>(h, sql`select now()::text as now`);
  return new Date(result[0]?.now ?? "").getTime();
}

describe("backoffMs", () => {
  it("doubles from the base and caps at the max", () => {
    const opts = { baseDelayMs: 1000, maxDelayMs: 5000 };
    expect([1, 2, 3, 4, 5].map((a) => backoffMs(a, opts))).toEqual([1000, 2000, 4000, 5000, 5000]);
    expect(backoffMs(0, opts)).toBe(1000);
  });
});

describe("job queue", () => {
  it("enqueues and claims a job, counting the attempt", async () => {
    const job = await enqueue(db, { type: "classify_and_notify", payload: { messageId: 7 } });
    expect(job.status).toBe("queued");

    const [claimed] = await claim(db);
    expect(claimed).toMatchObject({
      id: job.id,
      status: "running",
      attempts: 1,
      payload: { messageId: 7 },
    });
    expect(claimed?.lockedAt).toBeInstanceOf(Date);
    expect(await claim(db)).toEqual([]);
  });

  it("skips jobs that are not due yet and filters by type", async () => {
    await enqueue(db, { type: "a", runAfter: new Date(Date.now() + 60_000) });
    const b = await enqueue(db, { type: "b" });
    const c = await enqueue(db, { type: "c" });

    expect((await claim(db, { types: ["a", "c"] })).map((j) => j.id)).toEqual([c.id]);
    expect((await claim(db, { limit: 10 })).map((j) => j.id)).toEqual([b.id]);
  });

  it("never hands the same job to two concurrent workers (SKIP LOCKED)", async () => {
    for (let i = 0; i < 20; i++) await enqueue(db, { type: "t", payload: { i } });

    const batches = await Promise.all(Array.from({ length: 8 }, () => claim(db, { limit: 3 })));
    const ids = batches.flat().map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(20);
  });

  it("completes a job", async () => {
    const job = await enqueue(db, { type: "t" });
    await claim(db);
    await complete(db, job.id);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row).toMatchObject({ status: "done", lockedAt: null, lastError: null });
  });

  it("re-queues a failed job with exponential backoff", async () => {
    const job = await enqueue(db, { type: "t" });
    const opts = { baseDelayMs: 10_000, maxAttempts: 5 };

    await claim(db);
    let before = await dbNow();
    let row = await fail(db, job.id, new Error("boom"), opts);
    expect(row).toMatchObject({ status: "queued", attempts: 1, lastError: "boom", lockedAt: null });
    expect((row?.runAfter.getTime() ?? 0) - before).toBeGreaterThanOrEqual(9_000);
    expect((row?.runAfter.getTime() ?? 0) - before).toBeLessThan(11_000);

    // Not due yet, so nothing to claim.
    expect(await claim(db)).toEqual([]);

    // Make it due and fail again: the delay doubles.
    await db
      .update(jobs)
      .set({ runAfter: sql`now()` })
      .where(eq(jobs.id, job.id));
    await claim(db);
    before = await dbNow();
    row = await fail(db, job.id, "again", opts);
    expect(row?.attempts).toBe(2);
    expect((row?.runAfter.getTime() ?? 0) - before).toBeGreaterThanOrEqual(19_000);
    expect((row?.runAfter.getTime() ?? 0) - before).toBeLessThan(21_000);
  });

  it("marks a job failed once it runs out of attempts", async () => {
    const job = await enqueue(db, { type: "t" });
    for (let i = 1; i <= 3; i++) {
      await db
        .update(jobs)
        .set({ runAfter: sql`now()` })
        .where(eq(jobs.id, job.id));
      const [claimed] = await claim(db);
      expect(claimed?.attempts).toBe(i);
      const row = await fail(db, job.id, `try ${i}`, { maxAttempts: 3, baseDelayMs: 1 });
      expect(row?.status).toBe(i < 3 ? "queued" : "failed");
    }
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row).toMatchObject({ status: "failed", attempts: 3, lastError: "try 3" });
  });

  it("ignores complete/fail for jobs that are not running", async () => {
    const job = await enqueue(db, { type: "t" });
    await complete(db, job.id);
    expect(await fail(db, job.id, "x")).toBeUndefined();
    const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row?.status).toBe("queued");
  });

  it("re-queues stale running jobs", async () => {
    const job = await enqueue(db, { type: "t" });
    await claim(db);
    expect(await requeueStale(db, 60_000)).toBe(0);
    await db
      .update(jobs)
      .set({ lockedAt: sql`now() - interval '10 minutes'` })
      .where(eq(jobs.id, job.id));
    expect(await requeueStale(db, 60_000)).toBe(1);
    expect((await claim(db)).map((j) => j.attempts)).toEqual([2]);
  });
});
