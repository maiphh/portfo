import { describe, expect, it } from "vitest";
import { chunkText } from "../src/chunk";
import { deleteIds, getIds, ID_BATCH, MAX_CHUNKS_PER_DOC } from "../src/ingest";
import { call, fakeAi, fakeVectorize, testEnv } from "./helpers";

const docs = {
  documents: [
    {
      id: "document-ocr",
      title: "Document OCR pipeline",
      href: "/work/document-ocr",
      source: "case_study",
      text: "Para one.\n\nPara two.",
    },
    {
      id: "cv",
      title: "Experience",
      href: "/#timeline",
      source: "cv",
      text: Array.from({ length: 30 }, (_, i) => `Line ${i} `.repeat(12)).join("\n\n"),
    },
  ],
};

function ingest(body: unknown, auth?: string, overrides = {}, vec = fakeVectorize()) {
  const ai = fakeAi([]);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  const req = new Request("https://chat.test/ingest", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return call(req, testEnv({ AI: ai.ai, VECTORIZE: vec.index, ...overrides })).then((r) => ({
    ...r,
    ai,
    vec,
  }));
}

describe("POST /ingest", () => {
  it("needs the bearer INGEST_SECRET", async () => {
    for (const auth of [undefined, "Bearer wrong", "test-ingest-secret", "Basic dGVzdA=="]) {
      const { res, ai, vec } = await ingest(docs, auth);
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
      expect(ai.calls).toHaveLength(0);
      expect(vec.upserts).toHaveLength(0);
    }
    const { res } = await ingest(docs, "Bearer test-ingest-secret", { INGEST_SECRET: undefined });
    expect(res.status).toBe(503);
  });

  it("chunks, embeds with bge-m3 and upserts with metadata (incl. the doc's chunk count)", async () => {
    const { res, text, ai, vec } = await ingest(docs, "Bearer test-ingest-secret");
    expect(res.status).toBe(200);
    const body = JSON.parse(text);
    expect(body).toMatchObject({ ok: true, documents: 2, model: "@cf/baai/bge-m3", dims: 1024 });
    expect(body.chunks).toBe(vec.upserts.length);
    expect(ai.calls.every((c) => c.model === "@cf/baai/bge-m3")).toBe(true);
    expect(vec.upserts[0]).toMatchObject({
      id: "document-ocr:0",
      metadata: {
        title: "Document OCR pipeline",
        href: "/work/document-ocr",
        source: "case_study",
        text: "Para one.\nPara two.",
        doc: "document-ocr",
        i: 0,
        n: 1,
      },
    });
    expect(vec.upserts.every((v) => v.values.length === 1024)).toBe(true);
    // A fresh index: nothing existed, so nothing is deleted.
    expect(body.deleted).toBe(0);
    expect(vec.deleteCalls).toHaveLength(0);
  });

  it("validates the body", async () => {
    for (const body of [
      "nope",
      { documents: [] },
      { documents: [{ ...docs.documents[0], id: "Bad ID" }] },
      { documents: [{ ...docs.documents[0], href: "https://evil.test" }] },
    ]) {
      const { res } = await ingest(body, "Bearer test-ingest-secret");
      expect(res.status).toBe(400);
    }
  });
});

const AUTH = "Bearer test-ingest-secret";
const nine = Array.from({ length: 9 }, (_, k) => ({
  id: `doc-${k}`,
  title: `Doc ${k}`,
  href: `/work/doc-${k}`,
  source: "case_study" as const,
  text: k < 4 ? "One short paragraph." : "Para A.\n\n" + "word ".repeat(260),
}));

describe("stale-chunk cleanup", () => {
  it("re-ingesting the same 9 docs deletes 0 ids (the 563 bug)", async () => {
    const vec = fakeVectorize();
    const first = await ingest({ documents: nine }, AUTH, {}, vec);
    expect(first.res.status).toBe(200);
    const chunks = JSON.parse(first.text).chunks as number;
    expect(vec.store.size).toBe(chunks);
    // The old code computed 9 × 64 − chunks candidate ids and sent them in one call.
    expect(9 * MAX_CHUNKS_PER_DOC - chunks).toBeGreaterThan(ID_BATCH);

    const again = await ingest({ documents: nine }, AUTH, {}, vec);
    expect(again.res.status).toBe(200);
    expect(JSON.parse(again.text)).toMatchObject({ ok: true, chunks, deleted: 0 });
    expect(vec.deleteCalls).toHaveLength(0);
    expect(vec.store.size).toBe(chunks);
    // One getByIds for the 9 `:0` heads; no tail probing once `n` is recorded.
    expect(vec.getCalls.at(-1)).toHaveLength(9);
  });

  it("shrinking a doc deletes only its tail ids", async () => {
    const vec = fakeVectorize();
    const big = docs.documents[1];
    await ingest(docs, AUTH, {}, vec);
    const before = [...vec.store.keys()].filter((id) => id.startsWith("cv:")).length;
    expect(before).toBeGreaterThan(2);

    const small = { ...big, text: "Only one paragraph now." };
    const r = await ingest({ documents: [docs.documents[0], small] }, AUTH, {}, vec);
    const tail = Array.from({ length: before - 1 }, (_, k) => `cv:${k + 1}`);
    expect(JSON.parse(r.text).deleted).toBe(before - 1);
    expect(vec.deletes.sort()).toEqual(tail.sort());
    expect([...vec.store.keys()].sort()).toEqual(["cv:0", "document-ocr:0"]);
  });

  it("chunks from before the count was recorded: deletes only tail ids that exist", async () => {
    const store = new Map(
      ["document-ocr:0", "document-ocr:1", "document-ocr:2", "cv:0"].map((id) => [
        id,
        { id, values: [], metadata: { doc: id.split(":")[0], i: Number(id.split(":")[1]) } },
      ]),
    );
    const vec = fakeVectorize([], store);
    const r = await ingest({ documents: [docs.documents[0]] }, AUTH, {}, vec);
    expect(JSON.parse(r.text).deleted).toBe(2);
    expect(vec.deletes.sort()).toEqual(["document-ocr:1", "document-ocr:2"]);
    expect(vec.getCalls.flat().length).toBeLessThanOrEqual(1 + MAX_CHUNKS_PER_DOC);
    expect(vec.getCalls.every((c) => c.length <= ID_BATCH)).toBe(true);
    expect(store.has("cv:0")).toBe(true); // not in this request: untouched
  });

  it("legacy index with all 9 docs (the deployed state): probes in batches of ≤100", async () => {
    const store = new Map(
      nine.map((d) => [`${d.id}:0`, { id: `${d.id}:0`, values: [], metadata: { doc: d.id } }]),
    );
    const vec = fakeVectorize([], store);
    const r = await ingest({ documents: nine }, AUTH, {}, vec);
    expect(r.res.status).toBe(200);
    expect(JSON.parse(r.text).deleted).toBe(0);
    expect(vec.getCalls.every((c) => c.length <= ID_BATCH)).toBe(true);
    expect(vec.getCalls.flat().length).toBeGreaterThan(ID_BATCH);
  });

  it("rejects duplicate document ids", async () => {
    const { res } = await ingest({ documents: [docs.documents[0], docs.documents[0]] }, AUTH);
    expect(res.status).toBe(400);
  });
});

describe("Vectorize id batching (max 100 ids per call)", () => {
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => `d${Math.floor(i / 64)}:${i % 64}`);

  for (const [n, sizes] of [
    [100, [100]],
    [101, [100, 1]],
    [563, [100, 100, 100, 100, 100, 63]],
  ] as const) {
    it(`deleteByIds and getByIds with exactly ${n} ids`, async () => {
      const store = new Map(ids(n).map((id) => [id, { id, values: [] }]));
      const vec = fakeVectorize([], store);
      expect(await getIds(vec.index, ids(n))).toHaveLength(n);
      expect(vec.getCalls.map((c) => c.length)).toEqual(sizes);
      await deleteIds(vec.index, ids(n));
      expect(vec.deleteCalls.map((c) => c.length)).toEqual(sizes);
      expect(vec.deletes).toEqual(ids(n));
      expect(store.size).toBe(0);
    });
  }

  it("the fake rejects 101 ids in one call, like Vectorize", async () => {
    const vec = fakeVectorize();
    await expect(vec.index.deleteByIds(ids(101))).rejects.toThrow(/40007.*got 101/);
  });

  it("does not call Vectorize for 0 ids", async () => {
    const vec = fakeVectorize();
    await deleteIds(vec.index, []);
    expect(vec.deleteCalls).toHaveLength(0);
  });
});

describe("chunkText", () => {
  it("packs paragraphs up to the size and overlaps long text", () => {
    expect(chunkText("a\n\nb")).toEqual(["a\nb"]);
    const long = chunkText("word ".repeat(600), 900, 150);
    expect(long.length).toBeGreaterThan(3);
    expect(long.every((c) => c.length <= 1100)).toBe(true);
  });
});
