import type { Env } from "../env";
import { conflict, readDraft, requireEligibleMedia, validateDraft, type Item } from "./draft";
import { mediaPattern, reply, RequestError, uuidPattern } from "./http";
import { storeImage } from "./media";

interface Submission {
  id: string;
  fingerprint: string;
  status: "pending" | "accepted" | "rejected";
  title: string;
  body: string;
  alt: string | null;
  mediaId: string | null;
  width: number | null;
  height: number | null;
  createdAt: number;
  decidedAt: number | null;
  acceptedItemId: string | null;
}

const columns = `id, status, title, body, alt, media_id AS mediaId, width, height,
  created_at AS createdAt, decided_at AS decidedAt, accepted_item_id AS acceptedItemId`;
const find = (db: D1Database, id: string) =>
  db
    .prepare(`SELECT ${columns}, fingerprint FROM wall_submissions WHERE id = ?`)
    .bind(id)
    .first<Submission>();

function receipt(existing: Submission, fingerprint: string) {
  if (existing.fingerprint !== fingerprint)
    throw new RequestError(409, "This submission ID was already used for different content.");
  return reply({ id: existing.id, status: existing.status }, 201);
}

export async function submissionReceipt(db: D1Database, id: unknown, fingerprint: unknown) {
  if (
    typeof id !== "string" ||
    !uuidPattern.test(id) ||
    typeof fingerprint !== "string" ||
    !mediaPattern.test(fingerprint)
  )
    throw new RequestError(422, "Invalid submission ID.");
  const existing = await find(db, id);
  return existing ? receipt(existing, fingerprint) : reply({ error: "Submission not found." }, 404);
}

export async function submit(env: Env, form: FormData) {
  const id = form.get("id");
  const fingerprint = form.get("fingerprint");
  const title = form.get("title");
  const body = form.get("body");
  const alt = form.get("alt");
  const photo = form.has("mediaId");
  if (
    typeof id !== "string" ||
    !uuidPattern.test(id) ||
    typeof fingerprint !== "string" ||
    !mediaPattern.test(fingerprint) ||
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 100 ||
    typeof body !== "string" ||
    body.length > 5000 ||
    (!photo && !body.trim()) ||
    (photo && (typeof alt !== "string" || !alt.trim() || alt.length > 500))
  )
    throw new RequestError(422, "Check your title, note, and image description.");
  const existing = await find(env.DB, id);
  if (existing) return receipt(existing, fingerprint);
  const image = photo ? await storeImage(env, form, false) : null;
  const [, stored] = await env.DB.batch<Submission>([
    env.DB.prepare(
      `INSERT OR IGNORE INTO wall_submissions
       (id, fingerprint, title, body, alt, media_id, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      fingerprint,
      title,
      body,
      photo ? alt : null,
      image?.mediaId ?? null,
      image?.width ?? null,
      image?.height ?? null,
      Date.now(),
    ),
    env.DB.prepare(`SELECT ${columns}, fingerprint FROM wall_submissions WHERE id = ?`).bind(id),
  ]);
  const row = stored?.results[0];
  if (!row) throw new Error("Submission insert unavailable");
  return receipt(row, fingerprint);
}

export async function listSubmissions(db: D1Database, params: URLSearchParams) {
  const status = params.get("status") ?? "pending";
  if (!["pending", "accepted", "rejected"].includes(status))
    throw new RequestError(400, "Invalid status.");
  const cursor = params.get("cursor");
  const [time, sequence, extra] = cursor?.split(".") ?? [];
  if (
    cursor !== null &&
    (!time ||
      !/^\d{1,15}$/.test(time) ||
      !sequence ||
      !/^\d{1,15}$/.test(sequence) ||
      extra !== undefined)
  )
    throw new RequestError(400, "Invalid page cursor.");
  const { results } = await db
    .prepare(
      `SELECT ${columns}, rowid AS sequence FROM wall_submissions WHERE status = ?
     AND (created_at, rowid) < (?, ?) ORDER BY created_at DESC, rowid DESC LIMIT 21`,
    )
    .bind(status, time ? Number(time) : Number.MAX_SAFE_INTEGER, sequence ? Number(sequence) : 0)
    .all<Omit<Submission, "fingerprint"> & { sequence: number }>();
  const items = results.slice(0, 20);
  const last = items.at(-1);
  return reply({
    items: items.map(({ sequence: _sequence, ...item }) => item),
    nextCursor: results.length > 20 && last ? `${last.createdAt}.${last.sequence}` : null,
  });
}

export async function decide(
  db: D1Database,
  id: string,
  { action, folderId = "root", version }: Record<string, unknown>,
) {
  if (action !== "accept" && action !== "reject")
    throw new RequestError(400, "Choose accept or reject.");
  const requested = action === "accept" ? "accepted" : "rejected";
  const submission = await find(db, id);
  if (!submission) throw new RequestError(404, "Submission not found.");
  const finish = async (row: Submission | null) => {
    if (row?.status === requested)
      return reply({
        id,
        status: row.status,
        acceptedItemId: row.acceptedItemId,
      });
    if (row?.status !== "pending")
      return reply({ error: "This submission already has a different decision." }, 409);
    return conflict(db);
  };
  if (submission.status !== "pending") return finish(submission);
  if (action === "reject") {
    await db
      .prepare(
        "UPDATE wall_submissions SET status = 'rejected', decided_at = unixepoch() WHERE id = ? AND status = 'pending'",
      )
      .bind(id)
      .run();
    return finish(await find(db, id));
  }

  const draft = await readDraft(db);
  if (draft.version !== version) return finish(await find(db, id));
  if (
    typeof folderId !== "string" ||
    (folderId !== "root" &&
      !draft.items.some((item) => item.id === folderId && item.kind === "folder"))
  )
    throw new RequestError(422, "Choose a folder in the current draft.");
  const itemId = `submission-${id}`;
  const occupied = new Set(
    draft.items.filter((item) => item.parent === folderId).map(({ x, y }) => `${x}:${y}`),
  );
  let cell = 0;
  while (occupied.has(`${(cell % 4) * 240}:${Math.floor(cell / 4) * 260}`)) cell++;
  const item: Item = {
    id: itemId,
    kind: submission.mediaId ? "photo" : "note",
    title: submission.title,
    parent: folderId,
    x: (cell % 4) * 240,
    y: Math.floor(cell / 4) * 260,
    text: submission.body,
    ...(submission.mediaId
      ? {
          mediaId: submission.mediaId,
          width: submission.width ?? undefined,
          height: submission.height ?? undefined,
          alt: submission.alt ?? undefined,
        }
      : {}),
  };
  const validated = await validateDraft([...draft.items, item]);
  await requireEligibleMedia(db, validated.media, id);
  const operation = crypto.randomUUID();
  const [updated, accepted] = await db.batch([
    db
      .prepare(
        `UPDATE wall_draft SET version = version + 1, items_json = ?, dirty = 1,
       updated_at = unixepoch(), operation_id = ? WHERE version = ?
       AND (dirty = 1 OR base_revision IS (SELECT revision_id FROM wall_active WHERE singleton = 1))
       AND EXISTS (SELECT 1 FROM wall_submissions WHERE id = ? AND status = 'pending')`,
      )
      .bind(validated.serialized, operation, version, id),
    db
      .prepare(
        `UPDATE wall_submissions SET status = 'accepted', accepted_item_id = ?, decided_at = unixepoch()
       WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM wall_draft WHERE operation_id = ?)`,
      )
      .bind(itemId, id, operation),
  ]);
  return updated?.meta.changes && accepted?.meta.changes
    ? reply({ id, status: requested, acceptedItemId: itemId })
    : finish(await find(db, id));
}
