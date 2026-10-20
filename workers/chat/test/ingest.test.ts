import { describe, expect, it } from "vitest";
import { chunkText } from "../src/chunk";
import { MAX_CHUNKS_PER_DOC } from "../src/ingest";
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

function ingest(body: unknown, auth?: string, overrides = {}) {
  const ai = fakeAi([]);
  const vec = fakeVectorize();
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

  it("chunks, embeds with bge-m3 and upserts with metadata, then deletes stale chunk ids", async () => {
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
      },
    });
    expect(vec.upserts.every((v) => v.values.length === 1024)).toBe(true);
    expect(vec.deletes).toContain("document-ocr:1");
    expect(vec.deletes).not.toContain("document-ocr:0");
    expect(vec.deletes).toContain(`cv:${MAX_CHUNKS_PER_DOC - 1}`);
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

describe("chunkText", () => {
  it("packs paragraphs up to the size and overlaps long text", () => {
    expect(chunkText("a\n\nb")).toEqual(["a\nb"]);
    const long = chunkText("word ".repeat(600), 900, 150);
    expect(long.length).toBeGreaterThan(3);
    expect(long.every((c) => c.length <= 1100)).toBe(true);
  });
});
