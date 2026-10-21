import { describe, expect, it } from "vitest";
import { workList } from "../src/work";
import { env } from "./env";
import { call, ORIGIN } from "./helpers";

async function insertView(slug: string, visitor: string, createdAt: string) {
  await env.DB.prepare(
    `INSERT INTO page_views (slug, visitor_hash, referrer_host, day, created_at)
     VALUES (?, ?, NULL, ?, ?)`,
  )
    .bind(slug, visitor, createdAt.slice(0, 10), createdAt)
    .run();
}

describe("GET /popular", () => {
  it("orders by views desc then slug, and caches for 30s", async () => {
    const a = workList[0]?.slug ?? "document-ocr";
    const b = workList[1]?.slug ?? "legal-rag";
    const t = Date.now();
    await insertView(a, "v1", new Date(t - 86_400_000).toISOString());
    await insertView(a, "v2", new Date(t - 86_400_000).toISOString());
    await insertView(b, "v3", new Date(t - 86_400_000).toISOString());

    const { res } = await call(
      new Request("https://api.test/popular", { headers: { Origin: ORIGIN } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30");
    const data = (await res.json()) as {
      items: { slug: string; views: number; title: string; href: string }[];
      days: number;
    };
    expect(data.days).toBe(7);
    expect(data.items[0]?.slug).toBe(a);
    expect(data.items[0]?.views).toBe(2);
    expect(data.items[0]?.href).toBe(`/work/${a}`);
    expect(data.items[1]?.slug).toBe(b);
    expect(data.items[1]?.views).toBe(1);
  });
});
