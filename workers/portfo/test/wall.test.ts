import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import migration from "../migrations/0002_personal_wall.sql?raw";
import { handle } from "../src/index";
import { env } from "./env";
import { ORIGIN } from "./helpers";

const mediaId = "a".repeat(64);
const photo = {
  id: "photo",
  parent: "root",
  kind: "photo",
  title: "A memory",
  x: 120,
  y: 240,
  mediaId,
};
const thumbnail = `/wall/media/${mediaId}/thumbnail`;
const detail = `/wall/media/${mediaId}/detail`;

beforeAll(async () => {
  const [tables, trigger] = migration.split(/(?=CREATE TRIGGER)/);
  if (!tables || !trigger) throw new Error("Expected table and trigger statements");
  await env.DB.batch(
    tables
      .split(";")
      .filter((statement) => statement.trim())
      .map((sql) => env.DB.prepare(sql.trim())),
  );
  await env.DB.prepare(trigger.trim()).run();
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("UPDATE wall_active SET revision_id = NULL"),
    env.DB.prepare("DELETE FROM wall_revision_media"),
    env.DB.prepare("DELETE FROM wall_revisions"),
    env.DB.prepare("DELETE FROM wall_publish_parts"),
  ]);
});

async function snapshot(id: string, items: unknown[]) {
  return env.DB.prepare("INSERT INTO wall_revisions (id, items_json) VALUES (?, ?)")
    .bind(id, JSON.stringify(items))
    .run();
}

async function activate(id: string, expected: string | null) {
  return env.DB.prepare(
    "UPDATE wall_active SET revision_id = ? WHERE singleton = 1 AND revision_id IS ?",
  )
    .bind(id, expected)
    .run();
}

async function request(path: string, init: RequestInit = {}) {
  const context = createExecutionContext();
  const response = await handle(new Request(new URL(path, "https://api.test"), init), env, context);
  await waitOnExecutionContext(context);
  return response;
}

describe("Personal Wall", () => {
  it("serves an empty wall until a revision is activated", async () => {
    await snapshot("draft", [photo]);
    const response = await request("/wall", { headers: { Origin: ORIGIN } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ revision: null, items: [] });
  });

  it("assembles ordered parts before a large draft can be activated", async () => {
    const json = JSON.stringify([photo]);
    const part = env.DB.prepare(
      "INSERT INTO wall_publish_parts (revision_id, part_index, content) VALUES ('chunked', ?, ?)",
    );
    await env.DB.batch([part.bind(1, json.slice(30)), part.bind(0, json.slice(0, 30))]);
    await env.DB.prepare(
      `INSERT INTO wall_revisions (id, items_json)
       SELECT 'chunked', group_concat(content, '' ORDER BY part_index)
       FROM wall_publish_parts WHERE revision_id = 'chunked' HAVING COUNT(*) = 2`,
    ).run();
    await activate("chunked", null);
    expect(await (await request("/wall")).json()).toEqual({ revision: "chunked", items: [photo] });
  });

  it("serves active metadata and private R2 images, then removes public access on unpublish", async () => {
    await env.WALL_MEDIA.put(`wall/${mediaId}/thumbnail.webp`, "thumbnail bytes");
    await env.WALL_MEDIA.put(`wall/${mediaId}/detail.webp`, "detail bytes");
    await snapshot("initial", [photo, { ...photo, id: "second-card-for-same-image" }]);
    await snapshot("without-photo", []);

    expect((await request(thumbnail)).status).toBe(404);
    expect((await activate("initial", null)).meta.changes).toBe(1);
    expect(await (await request("/wall")).json()).toEqual({
      revision: "initial",
      items: [photo, { ...photo, id: "second-card-for-same-image" }],
    });

    const response = await request(thumbnail);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60, must-revalidate");
    const encoder = new TextEncoder();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(encoder.encode("thumbnail bytes"));
    expect(new Uint8Array(await (await request(detail)).arrayBuffer())).toEqual(
      encoder.encode("detail bytes"),
    );

    expect((await activate("without-photo", null)).meta.changes).toBe(0);
    expect((await request(detail)).status).toBe(200);
    expect((await activate("without-photo", "initial")).meta.changes).toBe(1);
    expect((await request(detail)).status).toBe(404);
    expect(await env.WALL_MEDIA.head(`wall/${mediaId}/detail.webp`)).not.toBeNull();
  });

  it("rejects writes and unknown image paths and handles missing objects", async () => {
    const absentMedia = "b".repeat(64);
    await snapshot("bad-media-reference", [{ ...photo, mediaId: absentMedia }]);
    await activate("bad-media-reference", null);

    expect((await request("/wall", { method: "POST" })).status).toBe(405);
    expect((await request(thumbnail, { method: "DELETE" })).headers.get("Allow")).toBe("GET");
    const preflight = await request("/wall", { method: "OPTIONS", headers: { Origin: ORIGIN } });
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
    expect((await request("/wall/media/some-other-file/thumbnail")).status).toBe(404);
    expect((await request(`/wall/media/${mediaId}/original`)).status).toBe(404);
    expect((await request(`/wall/media/${absentMedia}/detail`)).status).toBe(404);
  });
});
