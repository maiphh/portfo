import type { Env } from "../env";
import { mediaPattern, RequestError } from "./http";

export interface ImageInfo {
  mediaId: string;
  width: number;
  height: number;
}

export async function storeImage(env: Env, form: FormData, owner: boolean): Promise<ImageInfo> {
  const mediaId = form.get("mediaId");
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  const thumbnail = form.get("thumbnail");
  const detail = form.get("detail");
  if (
    typeof mediaId !== "string" ||
    !mediaPattern.test(mediaId) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 40_000_000 ||
    !(thumbnail instanceof File) ||
    !(detail instanceof File) ||
    !thumbnail.size ||
    !detail.size ||
    thumbnail.size + detail.size > 17_000_000 ||
    thumbnail.type !== "image/webp" ||
    detail.type !== "image/webp"
  )
    throw new RequestError(422, "Invalid normalized photo.");
  // The service-protected gateway assigns the ID from the normalized contents.
  // Concurrent writers for an ID write identical bytes.
  await Promise.all([
    env.WALL_MEDIA.put(`wall/${mediaId}/thumbnail.webp`, await thumbnail.arrayBuffer(), {
      httpMetadata: { contentType: "image/webp" },
    }),
    env.WALL_MEDIA.put(`wall/${mediaId}/detail.webp`, await detail.arrayBuffer(), {
      httpMetadata: { contentType: "image/webp" },
    }),
  ]);
  await env.DB.prepare(
    `INSERT INTO wall_uploads (media_id, owner_uploaded) VALUES (?, ?)
     ON CONFLICT (media_id) DO UPDATE SET owner_uploaded = MAX(owner_uploaded, excluded.owner_uploaded)`,
  )
    .bind(mediaId, Number(owner))
    .run();
  return { mediaId, width, height };
}

export async function privateMedia(env: Env, id: string, variant: string) {
  const known = await env.DB.prepare(
    `SELECT 1 FROM wall_uploads WHERE media_id = ?
     UNION ALL SELECT 1 FROM wall_revision_media WHERE media_id = ? LIMIT 1`,
  )
    .bind(id, id)
    .first();
  const object = known && (await env.WALL_MEDIA.get(`wall/${id}/${variant}.webp`));
  if (!object) throw new RequestError(404, "Image not found.");
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(object.size),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
