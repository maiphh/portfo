#!/usr/bin/env node
// Local owner tool. No remote action is taken without an explicit --production flag.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const usage =
  "Usage: node scripts/wall/publish.mjs <draft.json> (--prepare <output-dir> | --local [--persist-to <dir>] | --production)";
const draftPath = args[0];
const mode = args[1];
if (
  !draftPath ||
  !["--prepare", "--local", "--production"].includes(mode) ||
  (mode === "--prepare" && !args[2]) ||
  !(
    (mode === "--prepare" && args.length === 3) ||
    (mode === "--local" &&
      (args.length === 2 || (args.length === 4 && args[2] === "--persist-to" && args[3]))) ||
    (mode === "--production" && args.length === 2)
  )
)
  throw new Error(usage);
const workerDir = resolve("workers/portfo");
const localArgs =
  mode === "--local" && args[2] === "--persist-to"
    ? ["--local", "--persist-to", resolve(args[3])]
    : ["--local"];
const temp = mkdtempSync(join(tmpdir(), "portfo-wall-"));
const sqlQuote = (s) => `'${String(s).replaceAll("'", "''")}'`;
const run = (command, arguments_, options = {}) =>
  execFileSync(command, arguments_, { encoding: "utf8", maxBuffer: 30_000_000, ...options });
function wrangler(arguments_) {
  return run("pnpm", ["exec", "wrangler", ...arguments_], { cwd: workerDir });
}
function d1(arguments_) {
  return wrangler([
    "d1",
    "execute",
    "portfo",
    ...(mode === "--production" ? ["--env", "production", "--remote"] : localArgs),
    ...arguments_,
    "--json",
  ]);
}
function activeRevision() {
  const result = JSON.parse(
    d1(["--command", "SELECT revision_id FROM wall_active WHERE singleton = 1"]),
  );
  if (!Array.isArray(result) || !result[0]?.success || result[0]?.results?.length !== 1)
    throw new Error("Could not read the active wall revision.");
  return result[0].results[0].revision_id;
}
function validateDraft(draft) {
  if (
    !draft ||
    draft.schemaVersion !== 1 ||
    !Array.isArray(draft.items) ||
    draft.items.length > 1000
  )
    throw new Error("Expected a schemaVersion 1 draft with at most 1000 items.");
  const ids = new Set();
  for (const i of draft.items) {
    if (!i || !/^[A-Za-z0-9_-]{1,100}$/.test(i.id) || i.id === "root" || ids.has(i.id))
      throw new Error("Each item needs a unique valid ID.");
    ids.add(i.id);
    if (
      !["folder", "photo", "note"].includes(i.kind) ||
      typeof i.parent !== "string" ||
      typeof i.title !== "string" ||
      !i.title.trim() ||
      i.title.length > 100 ||
      !Number.isFinite(i.x) ||
      !Number.isFinite(i.y) ||
      Math.abs(i.x) > 1_000_000 ||
      Math.abs(i.y) > 1_000_000 ||
      (i.rotation !== undefined && (!Number.isFinite(i.rotation) || Math.abs(i.rotation) > 360))
    )
      throw new Error(`Invalid fields on ${i.id}.`);
    for (const key of ["text", "description", "alt"])
      if (i[key] !== undefined && (typeof i[key] !== "string" || i[key].length > 5000))
        throw new Error(`Invalid ${key} on ${i.id}.`);
  }
  const byId = new Map(draft.items.map((i) => [i.id, i]));
  for (const i of draft.items) {
    const seen = new Set([i.id]);
    let parent = i.parent;
    while (parent !== "root") {
      const node = byId.get(parent);
      if (!node || node.kind !== "folder" || seen.has(parent))
        throw new Error(`Invalid parent or cycle on ${i.id}.`);
      seen.add(parent);
      parent = node.parent;
    }
  }
}
function processPhoto(item, outputDir) {
  const match =
    typeof item.src === "string" &&
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.src);
  if (!match)
    throw new Error(`Photo ${item.id} must include JPEG, PNG or WebP bytes in the draft.`);
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 10_000_000 || bytes.toString("base64") !== match[2])
    throw new Error(`Invalid image bytes or image over 10 MB: ${item.id}.`);
  const input = join(temp, `${item.id}.input`);
  writeFileSync(input, bytes);
  const metadata = run("magick", ["identify", "-ping", "-format", "%m %w %h %n", input])
    .trim()
    .split(/\s+/);
  const [format, width, height, frames] = metadata;
  if (
    !["JPEG", "PNG", "WEBP"].includes(format) ||
    format.toLowerCase() !== (match[1] === "jpeg" ? "jpeg" : match[1]) ||
    Number(frames) !== 1 ||
    !Number(width) ||
    !Number(height) ||
    Number(width) * Number(height) > 40_000_000
  )
    throw new Error(`Unsupported or oversized image: ${item.id}.`);
  const variants = {};
  for (const [variant, size] of [
    ["thumbnail", "600x600>"],
    ["detail", "2000x2000>"],
  ]) {
    const path = join(temp, `${item.id}-${variant}.webp`);
    run("magick", [
      "-limit",
      "memory",
      "256MiB",
      "-limit",
      "map",
      "512MiB",
      input,
      "-auto-orient",
      "-strip",
      "-resize",
      size,
      "-quality",
      "82",
      path,
    ]);
    variants[variant] = readFileSync(path);
  }
  // Hash normalized output, so changing photo bytes creates a new public media ID.
  const id = createHash("sha256").update(variants.thumbnail).update(variants.detail).digest("hex");
  const directory = join(outputDir, id);
  mkdirSync(directory, { recursive: true });
  for (const [variant, bytes] of Object.entries(variants))
    writeFileSync(join(directory, `${variant}.webp`), bytes);
  const dimensions = run("magick", ["identify", "-format", "%w %h", join(directory, "detail.webp")])
    .trim()
    .split(/\s+/)
    .map(Number);
  return { mediaId: id, width: dimensions[0], height: dimensions[1] };
}
try {
  const inputBytes = readFileSync(resolve(draftPath));
  if (inputBytes.length > 500_000_000) throw new Error("Draft is over 500 MB.");
  const draft = JSON.parse(inputBytes.toString("utf8"));
  validateDraft(draft);
  const expected = mode === "--prepare" ? null : activeRevision();
  const reusableIds = [
    ...new Set(
      draft.items
        .filter(
          (i) =>
            i.kind === "photo" &&
            /^[0-9a-f]{64}$/.test(i.mediaId ?? "") &&
            /^[0-9a-f]{64}$/.test(i.sourceHash ?? ""),
        )
        .map((i) => i.mediaId),
    ),
  ];
  const reusableResult =
    mode !== "--prepare" && reusableIds.length
      ? JSON.parse(
          d1([
            "--command",
            `SELECT DISTINCT media_id FROM wall_revision_media WHERE media_id IN (${reusableIds.map(sqlQuote).join(",")})`,
          ]),
        )
      : [];
  if (
    reusableIds.length &&
    mode !== "--prepare" &&
    (!reusableResult[0]?.success || !Array.isArray(reusableResult[0].results))
  )
    throw new Error("Could not check existing media.");
  const reusable = new Set((reusableResult[0]?.results ?? []).map((row) => row.media_id));
  const out = mode === "--prepare" ? resolve(args[2]) : join(temp, "media");
  mkdirSync(out, { recursive: true });
  const published = draft.items.map((item) => {
    const result = Object.fromEntries(
      ["id", "parent", "kind", "title", "x", "y", "rotation", "text", "description", "alt"]
        .filter((key) => item[key] !== undefined)
        .map((key) => [key, item[key]]),
    );
    if (item.kind === "photo") {
      if (reusable.has(item.mediaId)) {
        const match =
          typeof item.src === "string" &&
          /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.src);
        const bytes = match ? Buffer.from(match[1], "base64") : null;
        if (
          !bytes ||
          !bytes.length ||
          bytes.length > 10_000_000 ||
          bytes.toString("base64") !== match[1] ||
          createHash("sha256").update(bytes).digest("hex") !== item.sourceHash ||
          !Number.isInteger(item.width) ||
          !Number.isInteger(item.height) ||
          item.width < 1 ||
          item.height < 1 ||
          item.width * item.height > 40_000_000
        )
          throw new Error(
            `Published photo bytes or dimensions changed for ${item.id}; add it as a new photo.`,
          );
        Object.assign(result, { mediaId: item.mediaId, width: item.width, height: item.height });
      } else Object.assign(result, processPhoto(item, out));
    }
    return result;
  });
  const manifest = JSON.stringify(published);
  if (Buffer.byteLength(manifest) > 1_500_000)
    throw new Error("Published item metadata is over 1.5 MB.");
  writeFileSync(join(out, "items.json"), JSON.stringify(published, null, 2));
  if (mode === "--prepare") {
    console.log(`Prepared ${published.length} items at ${out}; no resources changed.`);
  } else {
    const revision = createHash("sha256").update(manifest).digest("hex");
    if (expected === revision) {
      console.log(`Revision ${revision} is already active; no changes needed.`);
      rmSync(temp, { recursive: true, force: true });
      process.exit(0);
    }
    const mediaIds = [...new Set(published.filter((i) => i.mediaId).map((i) => i.mediaId))];
    const knownResult = mediaIds.length
      ? JSON.parse(
          d1([
            "--command",
            `SELECT DISTINCT media_id FROM wall_revision_media WHERE media_id IN (${mediaIds.map(sqlQuote).join(",")})`,
          ]),
        )
      : [];
    if (mediaIds.length && (!knownResult[0]?.success || !Array.isArray(knownResult[0].results)))
      throw new Error("Could not check existing media.");
    const known = new Set((knownResult[0]?.results ?? []).map((row) => row.media_id));
    const bucket = mode === "--production" ? "portfo-wall-media" : "portfo-wall-media-dev";
    for (const id of mediaIds.filter((id) => !known.has(id)))
      for (const variant of ["thumbnail", "detail"])
        wrangler([
          "r2",
          "object",
          "put",
          `${bucket}/wall/${id}/${variant}.webp`,
          "--file",
          join(out, id, `${variant}.webp`),
          "--content-type",
          "image/webp",
          ...(mode === "--production" ? ["--env", "production", "--remote"] : localArgs),
        ]);
    const points = Array.from(manifest);
    const chunks = [];
    for (let i = 0; i < points.length; i += 10_000)
      chunks.push(points.slice(i, i + 10_000).join(""));
    const partStatements = chunks.map(
      (part, index) =>
        `INSERT OR IGNORE INTO wall_publish_parts (revision_id, part_index, content) VALUES (${sqlQuote(revision)}, ${index}, ${sqlQuote(part)});`,
    );
    const sql = [
      ...partStatements,
      `INSERT OR IGNORE INTO wall_revisions (id, items_json) SELECT ${sqlQuote(revision)}, group_concat(content, '') FROM (SELECT content FROM wall_publish_parts WHERE revision_id = ${sqlQuote(revision)} ORDER BY part_index) HAVING COUNT(*) = ${chunks.length};`,
      `UPDATE wall_active SET revision_id = ${sqlQuote(revision)} WHERE singleton = 1 AND revision_id IS ${expected === null ? "NULL" : sqlQuote(expected)} AND EXISTS (SELECT 1 FROM wall_revisions WHERE id = ${sqlQuote(revision)});`,
      `DELETE FROM wall_publish_parts WHERE revision_id = ${sqlQuote(revision)};`,
    ].join("\n");
    const sqlFile = join(temp, "publish.sql");
    writeFileSync(sqlFile, sql);
    d1(["--file", sqlFile]);
    if (activeRevision() !== revision)
      throw new Error(
        "Publish conflict: another revision became active. Recheck the wall and retry.",
      );
    console.log(`Published ${revision} with ${published.length} items (${mode}).`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
