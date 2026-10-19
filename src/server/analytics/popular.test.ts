import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connect, truncate } from "../../../test/db";
import { pageViews } from "~/db/schema";
import { getPopular, POPULAR_CACHE_CONTROL } from "./popular";

const h = connect();
const db = h.db;
afterAll(() => h.close());
beforeEach(() => truncate(h, "page_views"));

const work = [
  { slug: "document-ocr", title: "Document OCR", href: "/#work-ocr" },
  { slug: "legal-rag", title: "Legal RAG", href: "/#work-rag" },
  { slug: "craftland", title: "Craftland", href: "/#craftland" },
];
const now = new Date("2026-10-19T03:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60_000);

async function seed(slug: string, visitors: number, at: Date, day = "2026-10-19") {
  for (let i = 0; i < visitors; i++) {
    await db
      .insert(pageViews)
      .values({ slug, visitorHash: `${slug}-${i}-${at.getTime()}`, day, createdAt: at });
  }
}

describe("getPopular", () => {
  it("ranks case studies by views in the last 7 days, ties by slug", async () => {
    await seed("legal-rag", 3, daysAgo(1));
    await seed("document-ocr", 5, daysAgo(2));
    await seed("craftland", 3, daysAgo(6));
    const r = await getPopular(db, work, { now });
    expect(r.items).toEqual([
      { slug: "document-ocr", title: "Document OCR", href: "/#work-ocr", views: 5 },
      { slug: "craftland", title: "Craftland", href: "/#craftland", views: 3 },
      { slug: "legal-rag", title: "Legal RAG", href: "/#work-rag", views: 3 },
    ]);
    expect(r.days).toBe(7);
    expect(r.since).toBe(daysAgo(7).toISOString());
  });

  it("leaves out views older than 7 days and unknown slugs", async () => {
    await seed("craftland", 4, daysAgo(8));
    await seed("legal-rag", 1, daysAgo(0));
    await seed("retired-project", 9, daysAgo(0));
    const r = await getPopular(db, work, { now });
    expect(r.items.map((i) => [i.slug, i.views])).toEqual([["legal-rag", 1]]);
  });

  it("returns an empty list when there is no data, and respects the limit", async () => {
    expect((await getPopular(db, work, { now })).items).toEqual([]);
    await seed("legal-rag", 2, daysAgo(0));
    await seed("craftland", 1, daysAgo(0));
    expect((await getPopular(db, work, { now, limit: 1 })).items).toHaveLength(1);
  });

  it("is cached ~30 s at the edge", () => {
    expect(POPULAR_CACHE_CONTROL).toContain("s-maxage=30");
  });
});
