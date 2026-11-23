import type { Env } from "./env";
import { error } from "./http";

type WallBindings = Pick<Env, "DB" | "WALL_MEDIA">;

const mediaPath = /^\/wall\/media\/([a-f0-9]{64})\/(thumbnail|detail)$/;

export async function handleWall(request: Request, pathname: string, env: WallBindings) {
  if (request.method !== "GET") {
    return error(405, "method_not_allowed", "Use GET.", { Allow: "GET" });
  }

  try {
    if (pathname === "/wall") {
      const row = await env.DB.prepare(
        `SELECT revisions.id, revisions.items_json
         FROM wall_active AS active
         JOIN wall_revisions AS revisions ON revisions.id = active.revision_id
         WHERE active.singleton = 1`,
      ).first<{ id: string; items_json: string }>();

      return Response.json(
        row
          ? { revision: row.id, items: JSON.parse(row.items_json) }
          : { revision: null, items: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const [, mediaId, variant] = mediaPath.exec(pathname) ?? [];
    if (!mediaId || !variant) return error(404, "not_found", "Image not found.");
    const published = await env.DB.prepare(
      `SELECT 1 FROM wall_active AS active
       JOIN wall_revision_media AS media ON media.revision_id = active.revision_id
       WHERE active.singleton = 1 AND media.media_id = ?`,
    )
      .bind(mediaId)
      .first();
    if (!published) return error(404, "not_found", "Image not found.");

    const object = await env.WALL_MEDIA.get(`wall/${mediaId}/${variant}.webp`);
    if (!object) return error(404, "not_found", "Image not found.");

    return new Response(object.body, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(object.size),
        "Cache-Control": "public, max-age=60, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        ETag: object.httpEtag,
      },
    });
  } catch (cause) {
    console.error("[wall] unavailable", cause);
    return error(503, "upstream_error", "The wall is temporarily unavailable.");
  }
}
