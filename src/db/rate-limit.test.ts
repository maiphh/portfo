import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connect, truncate } from "../../test/db";
import { hitRateLimit, pruneRateLimits, windowStart } from "./rate-limit";

const h = connect();
const db = h.db;
afterAll(() => h.close());
beforeEach(() => truncate(h, "rate_limits"));

const HOUR = 60 * 60_000;
const t0 = new Date("2026-10-19T03:15:00Z");

describe("windowStart", () => {
  it("floors to the window", () => {
    expect(windowStart(t0, HOUR).toISOString()).toBe("2026-10-19T03:00:00.000Z");
  });
});

describe("fixed-window rate limit", () => {
  it("allows up to the limit, then blocks", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await hitRateLimit(db, { key: "chat:v1", limit: 3, windowMs: HOUR, now: t0 }));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3]?.count).toBe(4);
    expect(results[0]?.resetAt.toISOString()).toBe("2026-10-19T04:00:00.000Z");
  });

  it("starts a fresh count in the next window", async () => {
    for (let i = 0; i < 3; i++) {
      await hitRateLimit(db, { key: "chat:v1", limit: 3, windowMs: HOUR, now: t0 });
    }
    const next = await hitRateLimit(db, {
      key: "chat:v1",
      limit: 3,
      windowMs: HOUR,
      now: new Date(t0.getTime() + HOUR),
    });
    expect(next).toMatchObject({ allowed: true, count: 1 });
  });

  it("keeps keys independent", async () => {
    await hitRateLimit(db, { key: "contact:a", limit: 1, windowMs: HOUR, now: t0 });
    const b = await hitRateLimit(db, { key: "contact:b", limit: 1, windowMs: HOUR, now: t0 });
    const a = await hitRateLimit(db, { key: "contact:a", limit: 1, windowMs: HOUR, now: t0 });
    expect(b.allowed).toBe(true);
    expect(a.allowed).toBe(false);
  });

  it("counts concurrent hits exactly", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        hitRateLimit(db, { key: "chat:burst", limit: 10, windowMs: HOUR, now: t0 }),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(results.map((r) => r.count).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
  });

  it("prunes old windows", async () => {
    await hitRateLimit(db, { key: "k", limit: 1, windowMs: HOUR, now: t0 });
    await hitRateLimit(db, {
      key: "k",
      limit: 1,
      windowMs: HOUR,
      now: new Date(t0.getTime() + HOUR),
    });
    // Windows start at 03:00 and 04:00; prune everything before 04:00.
    expect(await pruneRateLimits(db, new Date("2026-10-19T04:00:00Z"))).toBe(1);
  });

  it("rejects a non-positive limit", async () => {
    await expect(hitRateLimit(db, { key: "k", limit: 0, windowMs: HOUR })).rejects.toThrow();
  });
});
