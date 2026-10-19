import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, memoryLogger, truncate } from "../../test/db";
import { enqueue } from "~/db/queue";
import { contactMessages, jobs } from "~/db/schema";
import { handleCronJobs, isAuthorized } from "./cron";
import type { WorkerDeps } from "./contact/worker";

const h = connect();
const db = h.db;
afterAll(() => h.close());
beforeEach(() => truncate(h, "contact_messages", "jobs"));

const env = { CRON_SECRET: "s3cret-for-tests" };
const req = (auth?: string) =>
  new Request("http://localhost/api/cron/jobs", auth ? { headers: { authorization: auth } } : {});

function deps() {
  const notify = vi.fn(async () => undefined);
  const workerDeps: WorkerDeps = {
    db,
    classifier: { classify: async () => ({ category: "other", confidence: 0.6 }) },
    notifier: { notify },
    log: memoryLogger(),
  };
  return { notify, factory: vi.fn(() => workerDeps) };
}

describe("cron auth", () => {
  it("compares the bearer token exactly", () => {
    expect(isAuthorized("Bearer s3cret-for-tests", env.CRON_SECRET)).toBe(true);
    expect(isAuthorized("Bearer s3cret-for-test", env.CRON_SECRET)).toBe(false);
    expect(isAuthorized("s3cret-for-tests", env.CRON_SECRET)).toBe(false);
    expect(isAuthorized(null, env.CRON_SECRET)).toBe(false);
  });

  it.each([undefined, "Bearer wrong", "Basic s3cret-for-tests"])(
    "rejects %s with 401 and does no work",
    async (auth) => {
      const { factory } = deps();
      const res = await handleCronJobs(req(auth), env, factory);
      expect(res.status).toBe(401);
      expect(factory).not.toHaveBeenCalled();
    },
  );

  it("fails closed with 503 when CRON_SECRET is not set", async () => {
    const { factory } = deps();
    const res = await handleCronJobs(req("Bearer "), {}, factory);
    expect(res.status).toBe(503);
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("cron sweep", () => {
  it("re-queues stuck jobs and processes pending ones", async () => {
    const [msg] = await db
      .insert(contactMessages)
      .values({
        name: "Ada",
        email: "ada@example.com",
        body: "Hello there, Phu!",
        visitorHash: "h",
      })
      .returning();
    if (!msg) throw new Error("no message");
    const stuck = await enqueue(db, {
      type: "classify_and_notify",
      payload: { messageId: msg.id },
    });
    // Pretend a worker claimed it 20 minutes ago and died.
    await db
      .update(jobs)
      .set({ status: "running", attempts: 1, lockedAt: sql`now() - interval '20 minutes'` });

    const { notify, factory } = deps();
    const res = await handleCronJobs(req("Bearer s3cret-for-tests"), env, factory);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      requeued: 1,
      jobs: { claimed: 1, done: 1, retried: 0, failed: 0 },
    });
    expect(notify).toHaveBeenCalledTimes(1);
    const [row] = await db.select().from(jobs);
    expect(row).toMatchObject({ id: stuck.id, status: "done", attempts: 2 });
  });
});
