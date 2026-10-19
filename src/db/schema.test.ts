import { cosineDistance, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { connect, rows, truncate } from "../../test/db";
import { chunks, documents, EMBEDDING_DIMENSIONS } from "./schema";

const h = connect();
afterAll(() => h.close());
beforeEach(() => truncate(h, "documents"));

/** A unit vector along one axis, optionally nudged towards a second axis. */
function axis(i: number, nudge?: number): number[] {
  const v: number[] = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  v[i] = 1;
  if (nudge !== undefined) v[nudge] = 0.2;
  return v;
}

describe("migrations", () => {
  it("installs pgvector", async () => {
    const result = await rows<{ extname: string }>(
      h,
      sql`select extname from pg_extension where extname = 'vector'`,
    );
    expect(result).toHaveLength(1);
  });

  it("creates every table from docs/architecture.md", async () => {
    const result = await rows<{ table_name: string }>(
      h,
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(result.map((r) => r.table_name)).toEqual([
      "chat_logs",
      "chunks",
      "contact_messages",
      "documents",
      "github_activity",
      "github_repos",
      "jobs",
      "page_views",
      "rate_limits",
      "sync_runs",
    ]);
  });

  it("indexes chunk embeddings with HNSW and cosine ops", async () => {
    const result = await rows<{ indexdef: string }>(
      h,
      sql`select indexdef from pg_indexes where indexname = 'chunks_embedding_hnsw_idx'`,
    );
    expect(result[0]?.indexdef).toMatch(/USING hnsw \(embedding vector_cosine_ops\)/);
  });
});

describe("vector search", () => {
  it("returns the nearest chunks by cosine distance", async () => {
    const [doc] = await h.db
      .insert(documents)
      .values({ source: "cv", slug: "cv", title: "CV", contentHash: "abc" })
      .returning();
    if (!doc) throw new Error("no document");
    await h.db.insert(chunks).values([
      { documentId: doc.id, idx: 0, content: "x", embedding: axis(0) },
      { documentId: doc.id, idx: 1, content: "y", embedding: axis(1) },
      { documentId: doc.id, idx: 2, content: "x-ish", embedding: axis(0, 1) },
    ]);

    const distance = cosineDistance(chunks.embedding, axis(0));
    const nearest = await h.db
      .select({ content: chunks.content, distance })
      .from(chunks)
      .orderBy(distance)
      .limit(2);
    expect(nearest.map((r) => r.content)).toEqual(["x", "x-ish"]);
    expect(Number(nearest[0]?.distance)).toBeCloseTo(0, 6);
  });

  it("rejects embeddings of the wrong size", async () => {
    const [doc] = await h.db
      .insert(documents)
      .values({ source: "case_study", slug: "s", title: "S", contentHash: "h" })
      .returning();
    if (!doc) throw new Error("no document");
    await expect(
      h.db
        .insert(chunks)
        .values({ documentId: doc.id, idx: 0, content: "c", embedding: [1, 2, 3] }),
    ).rejects.toThrow();
  });
});
