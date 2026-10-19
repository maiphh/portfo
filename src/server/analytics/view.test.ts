import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connect, memoryLogger, truncate } from "../../../test/db";
import { pageViews } from "~/db/schema";
import { localDay } from "../visitor";
import { readViewBody, recordView, viewResponse, VIEW_LIMIT_PER_HOUR, type ViewDeps } from "./view";

const h = connect();
const db = h.db;
afterAll(() => h.close());
beforeEach(() => truncate(h, "page_views", "rate_limits"));

const knownSlugs = new Set(["document-ocr", "legal-rag", "craftland"]);
const meta = { ip: "203.0.113.7", userAgent: "Mozilla/5.0 vitest" };
// 10:00 in Saigon (03:00 UTC).
const now = new Date("2026-10-19T03:00:00Z");
const deps = (over: Partial<ViewDeps> = {}): ViewDeps => ({
  db,
  env: { NODE_ENV: "test", VISITOR_HASH_SALT: "test-salt" },
  log: memoryLogger(),
  knownSlugs,
  now,
  ...over,
});

describe("localDay", () => {
  it("uses the Asia/Ho_Chi_Minh calendar day", () => {
    expect(localDay(new Date("2026-10-19T16:59:59Z"))).toBe("2026-10-19");
    expect(localDay(new Date("2026-10-19T17:00:00Z"))).toBe("2026-10-20");
  });
});

describe("recordView", () => {
  it("records a view with a hashed visitor, day and referrer host", async () => {
    const r = await recordView(
      { slug: "document-ocr", referrer_host: "LinkedIn.com" },
      meta,
      deps(),
    );
    expect(r.kind).toBe("recorded");
    const [row] = await db.select().from(pageViews);
    expect(row).toMatchObject({
      slug: "document-ocr",
      day: "2026-10-19",
      referrerHost: "linkedin.com",
    });
    expect(row?.visitorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.visitorHash).not.toContain("203.0.113.7");
  });

  it("dedupes the same visitor, page and Saigon day", async () => {
    expect((await recordView({ slug: "legal-rag" }, meta, deps())).kind).toBe("recorded");
    const later = new Date("2026-10-19T16:30:00Z"); // 23:30 Saigon, same day
    expect((await recordView({ slug: "legal-rag" }, meta, deps({ now: later }))).kind).toBe(
      "duplicate",
    );
    // A different page and a different visitor both count.
    expect((await recordView({ slug: "craftland" }, meta, deps())).kind).toBe("recorded");
    const other = { ...meta, ip: "198.51.100.9" };
    expect((await recordView({ slug: "legal-rag" }, other, deps())).kind).toBe("recorded");
    expect(await db.$count(pageViews)).toBe(3);
  });

  it("counts again on the next Saigon day", async () => {
    await recordView({ slug: "legal-rag" }, meta, deps());
    const next = new Date("2026-10-19T17:05:00Z"); // 00:05 Saigon, Oct 20
    expect((await recordView({ slug: "legal-rag" }, meta, deps({ now: next }))).kind).toBe(
      "recorded",
    );
    const days = (await db.select({ day: pageViews.day }).from(pageViews)).map((r) => r.day);
    expect(days.sort()).toEqual(["2026-10-19", "2026-10-20"]);
  });

  it("rate limits a visitor to 60 beacons an hour", async () => {
    for (let i = 0; i < VIEW_LIMIT_PER_HOUR; i++) {
      const r = await recordView({ slug: "legal-rag" }, meta, deps());
      expect(r.kind).not.toBe("rate_limited");
    }
    expect((await recordView({ slug: "craftland" }, meta, deps())).kind).toBe("rate_limited");
    expect(await db.$count(pageViews)).toBe(1);
    // Next hour the window resets.
    const later = new Date(now.getTime() + 61 * 60_000);
    expect((await recordView({ slug: "craftland" }, meta, deps({ now: later }))).kind).toBe(
      "recorded",
    );
  });

  it("rejects unknown and malformed slugs without storing", async () => {
    expect(await recordView({ slug: "not-a-case-study" }, meta, deps())).toEqual({
      kind: "invalid",
      error: "unknown_slug",
    });
    for (const body of [{ slug: "../etc" }, { slug: "" }, {}, null, "document-ocr", { slug: 1 }]) {
      expect((await recordView(body, meta, deps())).kind).toBe("invalid");
    }
    expect(await db.$count(pageViews)).toBe(0);
  });

  it("drops a bad referrer host but keeps the view", async () => {
    await recordView({ slug: "craftland", referrer_host: "<script>" }, meta, deps());
    const [row] = await db.select().from(pageViews);
    expect(row?.referrerHost).toBeNull();
  });

  it("ignores bots and empty user agents", async () => {
    expect(
      (await recordView({ slug: "craftland" }, { ...meta, userAgent: "Googlebot/2.1" }, deps()))
        .kind,
    ).toBe("ignored");
    expect((await recordView({ slug: "craftland" }, { ...meta, userAgent: "" }, deps())).kind).toBe(
      "ignored",
    );
    expect(await db.$count(pageViews)).toBe(0);
  });

  it("fails closed in production without VISITOR_HASH_SALT", async () => {
    for (const env of [{ VERCEL_ENV: "production" }, { NODE_ENV: "production" }]) {
      const d = deps({ env });
      const r = await recordView({ slug: "craftland" }, meta, d);
      expect(r).toEqual({ kind: "unavailable", reason: "visitor_salt_not_configured" });
      expect(viewResponse(r).status).toBe(503);
    }
    expect(await db.$count(pageViews)).toBe(0);
  });
});

describe("viewResponse", () => {
  it("maps results to quiet statuses without cookies", () => {
    expect(viewResponse({ kind: "recorded" }).status).toBe(204);
    expect(viewResponse({ kind: "duplicate" }).status).toBe(202);
    expect(viewResponse({ kind: "ignored", reason: "bot" }).status).toBe(202);
    expect(viewResponse({ kind: "invalid", error: "x" }).status).toBe(400);
    expect(viewResponse({ kind: "rate_limited" }).status).toBe(429);
    expect(viewResponse({ kind: "recorded" }).headers.get("set-cookie")).toBeNull();
  });
});

describe("readViewBody", () => {
  const req = (body: string, type?: string) =>
    new Request("http://x/api/view", {
      method: "POST",
      body,
      headers: type ? { "content-type": type } : {},
    });
  it("reads JSON, sendBeacon text/plain and form bodies", async () => {
    expect(await readViewBody(req('{"slug":"craftland"}', "application/json"))).toEqual({
      slug: "craftland",
    });
    expect(await readViewBody(req('{"slug":"craftland"}', "text/plain;charset=UTF-8"))).toEqual({
      slug: "craftland",
    });
    expect(await readViewBody(req("slug=craftland", "application/x-www-form-urlencoded"))).toEqual({
      slug: "craftland",
    });
  });
  it("reads a JSON string even when it arrives labelled as a form", async () => {
    expect(
      await readViewBody(req('{"slug":"craftland"}', "application/x-www-form-urlencoded")),
    ).toEqual({
      slug: "craftland",
    });
  });
  it("returns null for junk and oversized bodies", async () => {
    expect(await readViewBody(req("{nope"))).toBeNull();
    expect(await readViewBody(req(JSON.stringify({ slug: "x".repeat(3000) })))).toBeNull();
  });
});
