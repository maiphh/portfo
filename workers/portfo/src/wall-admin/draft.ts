import type { Env } from "../env";
import { MAX_METADATA, mediaPattern, reply, RequestError } from "./http";

export interface Item {
  id: string;
  parent: string;
  kind: "note" | "photo" | "folder";
  title: string;
  x: number;
  y: number;
  rotation?: number;
  text?: string;
  alt?: string;
  description?: string;
  mediaId?: string;
  width?: number;
  height?: number;
}

interface DraftRow {
  version: number;
  baseRevision: string | null;
  activeRevision: string | null;
  items_json: string;
}

const live = "(SELECT revision_id FROM wall_active WHERE singleton = 1)";
const liveItems = `COALESCE((SELECT items_json FROM wall_revisions WHERE id = ${live}), '[]')`;

export async function readDraft(db: D1Database) {
  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO wall_draft (singleton, version, base_revision, items_json)
       SELECT 1, 1, ${live}, ${liveItems} WHERE NOT EXISTS (SELECT 1 FROM wall_draft)`,
    ),
    db.prepare(
      `UPDATE wall_draft SET version = version + 1, base_revision = ${live}, items_json = ${liveItems},
       operation_id = NULL, updated_at = unixepoch()
       WHERE dirty = 0 AND base_revision IS NOT ${live}`,
    ),
  ]);
  const row = await db
    .prepare(
      `SELECT version, base_revision AS baseRevision, ${live} AS activeRevision, items_json
     FROM wall_draft WHERE singleton = 1`,
    )
    .first<DraftRow>();
  if (!row) throw new Error("Wall draft unavailable");
  return {
    version: row.version,
    baseRevision: row.baseRevision,
    activeRevision: row.activeRevision,
    items: JSON.parse(row.items_json) as Item[],
  };
}

export async function conflict(
  db: D1Database,
  message = "The server draft changed. Reload it to continue.",
) {
  const { version, activeRevision, baseRevision } = await readDraft(db);
  return reply({ error: message, version, activeRevision, baseRevision }, 409);
}

export async function validateDraft(input: unknown) {
  if (!Array.isArray(input) || input.length > 1000)
    throw new RequestError(422, "A wall can contain up to 1,000 items.");
  const invalid = () => new RequestError(422, "Check card fields, coordinates, and folder links.");
  const ids = new Map<string, Item>();
  const media = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== "object") throw invalid();
    const item = value as Item;
    const {
      id,
      parent,
      kind,
      title,
      x,
      y,
      rotation,
      text,
      alt,
      description,
      mediaId,
      width,
      height,
    } = item;
    if (
      typeof id !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(id) ||
      id === "root" ||
      ids.has(id) ||
      typeof parent !== "string" ||
      !["folder", "note", "photo"].includes(kind) ||
      typeof title !== "string" ||
      !title.trim() ||
      title.length > 100 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x) > 1_000_000 ||
      Math.abs(y) > 1_000_000 ||
      (rotation !== undefined && (!Number.isFinite(rotation) || Math.abs(rotation) > 360)) ||
      [text, alt, description].some(
        (field) => field !== undefined && (typeof field !== "string" || field.length > 5000),
      )
    )
      throw invalid();
    if (kind === "photo") {
      if (
        typeof mediaId !== "string" ||
        !mediaPattern.test(mediaId) ||
        typeof width !== "number" ||
        typeof height !== "number" ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        width * height > 40_000_000
      )
        throw new RequestError(422, "A photo has an invalid asset or dimensions.");
      media.add(mediaId);
    }
    ids.set(id, {
      id,
      parent,
      kind,
      title,
      x,
      y,
      rotation,
      ...(kind === "folder" ? { description } : { text }),
      ...(kind === "photo" ? { alt, mediaId, width, height } : {}),
    });
  }

  const anchored = new Set(["root"]);
  for (const item of ids.values()) {
    const trail = new Set([item.id]);
    let parent = item.parent;
    while (!anchored.has(parent)) {
      const folder = ids.get(parent);
      if (!folder || folder.kind !== "folder" || trail.has(parent)) throw invalid();
      trail.add(parent);
      parent = folder.parent;
    }
    for (const id of trail) if (ids.get(id)?.kind === "folder") anchored.add(id);
  }

  const items = [...ids.values()];
  const serialized = JSON.stringify(items);
  if (new TextEncoder().encode(serialized).byteLength > MAX_METADATA)
    throw new RequestError(413, "Wall metadata exceeds 1.5 MB.");

  return { items, serialized, media };
}

export async function requireEligibleMedia(db: D1Database, media: Set<string>, accepting?: string) {
  if (!media.size) return;
  const missing = await db
    .prepare(
      `SELECT value FROM json_each(?) AS requested
     WHERE NOT EXISTS (SELECT 1 FROM wall_revision_media WHERE media_id = requested.value)
       AND NOT EXISTS (SELECT 1 FROM wall_uploads WHERE media_id = requested.value AND owner_uploaded = 1)
       AND NOT EXISTS (
         SELECT 1 FROM wall_submissions WHERE media_id = requested.value
           AND (status = 'accepted' OR id = ?)
       ) LIMIT 1`,
    )
    .bind(JSON.stringify([...media]), accepting ?? null)
    .first();
  if (missing) throw new RequestError(422, "A photo is unavailable for use in the draft.");
}

export async function saveDraft(db: D1Database, version: unknown, items: unknown) {
  const draft = await readDraft(db);
  if (draft.version !== version) return conflict(db);
  const validated = await validateDraft(items);
  await requireEligibleMedia(db, validated.media);
  const update = await db
    .prepare(
      `UPDATE wall_draft SET version = version + 1, items_json = ?, dirty = 1,
     operation_id = NULL, updated_at = unixepoch()
     WHERE singleton = 1 AND version = ? AND (dirty = 1 OR base_revision IS ${live})`,
    )
    .bind(validated.serialized, version)
    .run();
  if (!update.meta.changes) return conflict(db);
  const active = await db
    .prepare(`SELECT ${live} AS revision`)
    .first<{ revision: string | null }>();
  return reply({
    ...draft,
    activeRevision: active?.revision ?? null,
    version: draft.version + 1,
    items: validated.items,
  });
}

export async function resetDraft(db: D1Database, version: unknown, activeRevision: unknown) {
  if (
    !Number.isSafeInteger(version) ||
    !(activeRevision === null || typeof activeRevision === "string")
  )
    throw new RequestError(400, "Expected draft version and live revision.");
  await readDraft(db);
  const row = await db
    .prepare(
      `UPDATE wall_draft SET version = version + 1, base_revision = ${live}, items_json = ${liveItems},
     dirty = 0, operation_id = NULL, updated_at = unixepoch()
     WHERE singleton = 1 AND version = ? AND ${live} IS ?
     RETURNING version, base_revision AS baseRevision, items_json`,
    )
    .bind(version, activeRevision)
    .first<DraftRow>();
  return row
    ? reply({
        version: row.version,
        baseRevision: row.baseRevision,
        activeRevision,
        items: JSON.parse(row.items_json),
      })
    : conflict(db);
}

export async function publishDraft(env: Env, version: unknown, base: unknown) {
  if (!Number.isSafeInteger(version) || !(base === null || typeof base === "string"))
    throw new RequestError(400, "Expected draft version and base revision.");
  const { DB: db, WALL_MEDIA: bucket } = env;
  const receipt = () =>
    db
      .prepare(
        "SELECT revision, result_version AS version FROM wall_publish_receipts WHERE version = ? AND base_revision IS ?",
      )
      .bind(version, base)
      .first();
  const previous = await receipt();
  if (previous) return reply(previous);
  const draft = await readDraft(db);
  const stale = async () => {
    const committed = await receipt();
    return committed
      ? reply(committed)
      : conflict(
          db,
          "The draft or live wall changed. Review the latest versions before publishing.",
        );
  };
  if (draft.version !== version || draft.baseRevision !== base || draft.activeRevision !== base)
    return stale();

  const { serialized, media } = await validateDraft(draft.items);
  await requireEligibleMedia(db, media);
  const missing = new Set(
    [...media].flatMap((id) => [`wall/${id}/thumbnail.webp`, `wall/${id}/detail.webp`]),
  );
  // List in pages so a large draft does not spend two Worker subrequests per photo.
  let cursor: string | undefined;
  while (missing.size) {
    const page = await bucket.list({ prefix: "wall/", cursor });
    for (const object of page.objects) if (object.size) missing.delete(object.key);
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  if (missing.size)
    throw new RequestError(503, "A photo is missing a variant. The live wall was kept.");

  const revision = crypto.randomUUID();
  const [inserted, activated, updated, recorded] = await db.batch([
    db
      .prepare(
        `INSERT INTO wall_revisions (id, items_json)
       SELECT ?, ? FROM wall_draft WHERE version = ? AND base_revision IS ? AND ${live} IS ?`,
      )
      .bind(revision, serialized, version, base, base),
    db
      .prepare(
        `UPDATE wall_active SET revision_id = ? WHERE singleton = 1 AND revision_id IS ?
       AND EXISTS (SELECT 1 FROM wall_revisions WHERE id = ?)`,
      )
      .bind(revision, base, revision),
    db
      .prepare(
        `UPDATE wall_draft SET version = version + 1, base_revision = ?, items_json = ?,
       dirty = 0, operation_id = ?, updated_at = unixepoch()
       WHERE version = ? AND ${live} = ?`,
      )
      .bind(revision, serialized, revision, version, revision),
    db
      .prepare(
        `INSERT INTO wall_publish_receipts (version, base_revision, revision, result_version)
       SELECT ?, ?, ?, version FROM wall_draft WHERE operation_id = ? AND ${live} = ?`,
      )
      .bind(version, base, revision, revision, revision),
  ]);
  return [inserted, activated, updated, recorded].every((result) => result?.meta.changes)
    ? reply({ revision, version: draft.version + 1 })
    : stale();
}
