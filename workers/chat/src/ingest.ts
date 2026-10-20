/**
 * POST /ingest (Authorization: Bearer INGEST_SECRET): chunks, embeds (bge-m3, 1024 dims)
 * and upserts documents into Vectorize. Called by scripts/ingest.ts, from GitHub Actions
 * on merge to main. Stale chunks of a shrunk document are deleted by id.
 */
import { z } from "zod";
import { chunkText } from "./chunk";
import { EMBED_DIMS, EMBED_MODEL, MAX_BODY_BYTES } from "./config";
import type { Env } from "./env";
import { error, safeEqual } from "./http";

export const MAX_CHUNKS_PER_DOC = 64;
const EMBED_BATCH = 32;

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

  const rows = parsed.data.documents.flatMap((d) =>
    chunkText(d.text)
      .slice(0, MAX_CHUNKS_PER_DOC)
      .map((text, i) => ({
        id: `${d.id}:${i}`,
        doc: d.id,
        i,
        title: d.title,
        href: d.href,
        source: d.source,
        text,
      })),
  );

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
          title: r.title,
          href: r.href,
          source: r.source,
          text: r.text,
        },
      }),
    );
  }
  for (let i = 0; i < vectors.length; i += 500)
    await env.VECTORIZE.upsert(vectors.slice(i, i + 500));

  const stale: string[] = [];
  for (const d of parsed.data.documents) {
    const n = rows.filter((r) => r.doc === d.id).length;
    for (let i = n; i < MAX_CHUNKS_PER_DOC; i++) stale.push(`${d.id}:${i}`);
  }
  if (stale.length) await env.VECTORIZE.deleteByIds(stale);

  return Response.json(
    {
      ok: true,
      documents: parsed.data.documents.length,
      chunks: rows.length,
      model: EMBED_MODEL,
      dims: EMBED_DIMS,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
