/**
 * POST /ingest (Authorization: Bearer INGEST_SECRET): chunks, embeds (bge-m3, 1024 dims)
 * and upserts documents into Vectorize. Called by scripts/ingest.ts, from GitHub Actions
 * on merge to main. Stale chunks of a shrunk document are deleted by id.
 *
 * Chunk ids are `${doc}:${i}`. Every chunk's metadata carries `n`, the doc's chunk count at
 * that ingest, so the next ingest knows exactly which ids exist: it reads `${doc}:0` before
 * upserting and deletes only `${doc}:${newN}` … `${doc}:${oldN - 1}`. Re-ingesting the same
 * docs deletes nothing. Chunks written before `n` existed are found by probing the tail ids
 * with getByIds, and only the ids that come back are deleted.
 */
import { z } from "zod";
import { chunkText } from "./chunk";
import { EMBED_DIMS, EMBED_MODEL, MAX_BODY_BYTES } from "./config";
import type { Env, VectorIndex } from "./env";
import { error, safeEqual } from "./http";

export const MAX_CHUNKS_PER_DOC = 64;
const EMBED_BATCH = 32;
/** Vectorize rejects more ids per deleteByIds call (error 40007, "max id count is 100"). We
 * apply the same cap to getByIds, whose limit is not documented. */
export const ID_BATCH = 100;
/** Vectorize allows 1000 vectors per upsert from a Worker; 500 keeps each body well under. */
export const UPSERT_BATCH = 500;

export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** deleteByIds in calls of at most ID_BATCH ids. */
export async function deleteIds(index: VectorIndex, ids: readonly string[]): Promise<void> {
  for (const b of batches(ids, ID_BATCH)) await index.deleteByIds(b);
}

/** getByIds in calls of at most ID_BATCH ids. Missing ids are simply not returned. */
export async function getIds(
  index: VectorIndex,
  ids: readonly string[],
): Promise<{ id: string; metadata?: Record<string, unknown> }[]> {
  const out: { id: string; metadata?: Record<string, unknown> }[] = [];
  for (const b of batches(ids, ID_BATCH)) out.push(...(await index.getByIds(b)));
  return out;
}

const chunkId = (doc: string, i: number) => `${doc}:${i}`;

/**
 * Ids to delete after re-ingesting docs with `counts` (doc → new chunk count). Reads each
 * doc's previous `:0` chunk: its metadata `n` says how many chunks the last ingest wrote.
 * Must run before the upsert overwrites `:0`.
 */
export async function staleIds(
  index: VectorIndex,
  counts: ReadonlyMap<string, number>,
): Promise<string[]> {
  const heads = await getIds(
    index,
    [...counts.keys()].map((d) => chunkId(d, 0)),
  );
  const stale: string[] = [];
  const legacy: string[] = [];
  for (const h of heads) {
    const doc = typeof h.metadata?.doc === "string" ? h.metadata.doc : h.id.replace(/:0$/, "");
    const now = counts.get(doc);
    if (now === undefined) continue;
    const prev = h.metadata?.n;
    if (typeof prev === "number" && Number.isInteger(prev)) {
      for (let i = now; i < Math.min(prev, MAX_CHUNKS_PER_DOC); i++) stale.push(chunkId(doc, i));
    } else {
      // Written before `n` was recorded: probe the possible tail, keep only ids that exist.
      for (let i = Math.max(now, 1); i < MAX_CHUNKS_PER_DOC; i++) legacy.push(chunkId(doc, i));
    }
  }
  if (legacy.length) for (const v of await getIds(index, legacy)) stale.push(v.id);
  return stale;
}

const docSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string().min(1).max(200),
  href: z.string().regex(/^\/[^\s]*$/, "href must be a site path"),
  source: z.enum(["cv", "case_study", "profile"]),
  text: z.string().min(1).max(40_000),
});
const bodySchema = z.object({ documents: z.array(docSchema).min(1).max(50) }).strict();

export async function handleIngest(request: Request, env: Env): Promise<Response> {
  if (!env.INGEST_SECRET) return error(503, "not_configured", "INGEST_SECRET is not set.");
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !(await safeEqual(token, env.INGEST_SECRET)))
    return error(401, "unauthorized", "Bad or missing bearer token.", {
      "WWW-Authenticate": "Bearer",
    });

  const raw = await request.text();
  if (raw.length > 50 * MAX_BODY_BYTES) return error(413, "too_long", "Body too large.");
  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    return error(400, "bad_request", "Body must be JSON.");
  }
  if (!parsed.success)
    return error(
      400,
      "bad_request",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );

  const ids = parsed.data.documents.map((d) => d.id);
  if (new Set(ids).size !== ids.length) return error(400, "bad_request", "Duplicate document id.");

  const rows = parsed.data.documents.flatMap((d) => {
    const chunks = chunkText(d.text).slice(0, MAX_CHUNKS_PER_DOC);
    return chunks.map((text, i) => ({
      id: chunkId(d.id, i),
      doc: d.id,
      i,
      n: chunks.length,
      title: d.title,
      href: d.href,
      source: d.source,
      text,
    }));
  });

  const vectors: { id: string; values: number[]; metadata: Record<string, unknown> }[] = [];
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const batch = rows.slice(i, i + EMBED_BATCH);
    const out = (await env.AI.run(EMBED_MODEL, {
      text: batch.map((r) => `${r.title}\n${r.text}`),
    })) as { data?: number[][] };
    if (
      !out.data ||
      out.data.length !== batch.length ||
      out.data.some((v) => v.length !== EMBED_DIMS)
    )
      return error(502, "upstream_error", "Embedding failed.");
    batch.forEach((r, j) =>
      vectors.push({
        id: r.id,
        values: out.data?.[j] ?? [],
        metadata: {
          doc: r.doc,
          i: r.i,
          n: r.n,
          title: r.title,
          href: r.href,
          source: r.source,
          text: r.text,
        },
      }),
    );
  }

  // Before the upsert: it overwrites each `:0` chunk and its previous count.
  const counts = new Map(parsed.data.documents.map((d) => [d.id, 0]));
  for (const r of rows) counts.set(r.doc, r.n);
  const stale = await staleIds(env.VECTORIZE, counts);

  for (const b of batches(vectors, UPSERT_BATCH)) await env.VECTORIZE.upsert(b);
  await deleteIds(env.VECTORIZE, stale);

  return Response.json(
    {
      ok: true,
      documents: parsed.data.documents.length,
      chunks: rows.length,
      deleted: stale.length,
      model: EMBED_MODEL,
      dims: EMBED_DIMS,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
