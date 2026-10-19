import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, memoryLogger, truncate } from "../../../test/db";
import { contactMessages, jobs } from "~/db/schema";
import type { Classification, Classifier } from "./classify";
import type { Notifier, NotifyInput } from "./notify";
import { submitContact } from "./submit";
import { runContactJobs, type WorkerDeps } from "./worker";

const h = connect();
const db = h.db;
afterAll(() => h.close());
beforeEach(() => truncate(h, "contact_messages", "jobs", "rate_limits"));

let ip = 0;
async function submit(message = "We're hiring an AI engineer in HCMC.") {
  const r = await submitContact(
    { name: "Ada Lovelace", email: "ada@example.com", message },
    { ip: `192.0.2.${++ip}`, userAgent: "vitest" },
    { db, env: { NODE_ENV: "test", VISITOR_HASH_SALT: "s" }, log: memoryLogger() },
  );
  if (r.kind !== "accepted") throw new Error(`not accepted: ${r.kind}`);
  return r;
}

function fakes(result: Classification, notifyImpl?: () => Promise<void>) {
  const classify = vi.fn<Classifier["classify"]>(async () => result);
  const notify = vi.fn<Notifier["notify"]>(notifyImpl ?? (async () => undefined));
  const deps: WorkerDeps = {
    db,
    classifier: { classify },
    notifier: { notify },
    log: memoryLogger(),
    backoff: { baseDelayMs: 0 },
  };
  return { classify, notify, deps };
}

const message = async (id: number) =>
  (await db.select().from(contactMessages).where(eq(contactMessages.id, id)))[0];
const job = async (id: number) => (await db.select().from(jobs).where(eq(jobs.id, id)))[0];

describe("contact worker", () => {
  it("classifies, stores the result and emails Phu", async () => {
    const r = await submit();
    const { classify, notify, deps } = fakes({ category: "recruiter", confidence: 0.92 });

    expect(await runContactJobs(deps)).toEqual({ claimed: 1, done: 1, retried: 0, failed: 0 });
    expect(classify).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "We're hiring an AI engineer in HCMC.",
      roleHint: undefined,
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toMatchObject<Partial<NotifyInput>>({
      messageId: r.messageId,
      category: "recruiter",
      email: "ada@example.com",
    });
    expect(await message(r.messageId)).toMatchObject({
      category: "recruiter",
      status: "notified",
    });
    expect((await message(r.messageId))?.confidence).toBeCloseTo(0.92, 5);
    expect(await job(r.jobId)).toMatchObject({ status: "done", attempts: 1 });
    // Nothing left to do.
    expect((await runContactJobs(deps)).claimed).toBe(0);
  });

  it("stores spam without emailing", async () => {
    const r = await submit("Cheap SEO services, best backlinks, visit now!!!");
    const { notify, deps } = fakes({ category: "spam", confidence: 0.99 });
    await runContactJobs(deps);
    expect(notify).not.toHaveBeenCalled();
    expect(await message(r.messageId)).toMatchObject({ category: "spam", status: "classified" });
    expect((await job(r.jobId))?.status).toBe("done");
  });

  it("retries with backoff and marks the job and message failed after 5 attempts", async () => {
    const r = await submit();
    const { classify, notify, deps } = fakes({ category: "client", confidence: 0.8 }, async () => {
      throw new Error("Resend responded 500");
    });

    const summaries = [];
    for (let i = 0; i < 6; i++) {
      // Backoff is 0 in this test; make sure the job is due on each pass.
      await db.update(jobs).set({ runAfter: sql`now() - interval '1 second'` });
      summaries.push(await runContactJobs(deps));
    }
    expect(summaries.map((s) => [s.retried, s.failed])).toEqual([
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
      [0, 1],
      [0, 0], // nothing left to claim
    ]);
    expect(notify).toHaveBeenCalledTimes(5);
    // Classified once; retries skip the step that already succeeded.
    expect(classify).toHaveBeenCalledTimes(1);
    expect(await job(r.jobId)).toMatchObject({
      status: "failed",
      attempts: 5,
      lastError: "Resend responded 500",
    });
    expect((await message(r.messageId))?.status).toBe("failed");
  });

  it("uses real backoff between attempts by default", async () => {
    const r = await submit();
    const { deps } = fakes({ category: "other", confidence: 0.5 }, async () => {
      throw new Error("down");
    });
    delete deps.backoff;
    await runContactJobs(deps);
    const row = await job(r.jobId);
    expect(row?.status).toBe("queued");
    expect((row?.runAfter.getTime() ?? 0) - Date.now()).toBeGreaterThan(20_000);
    expect((await runContactJobs(deps)).claimed).toBe(0);
  });

  it("recovers on a later attempt without emailing twice", async () => {
    const r = await submit();
    let calls = 0;
    const { notify, deps } = fakes({ category: "client", confidence: 0.7 }, async () => {
      if (++calls === 1) throw new Error("timeout");
    });
    await runContactJobs(deps);
    await db.update(jobs).set({ runAfter: sql`now() - interval '1 second'` });
    expect(await runContactJobs(deps)).toEqual({ claimed: 1, done: 1, retried: 0, failed: 0 });
    expect(notify).toHaveBeenCalledTimes(2);
    expect((await message(r.messageId))?.status).toBe("notified");
    expect(await job(r.jobId)).toMatchObject({ status: "done", attempts: 2 });
  });
});
