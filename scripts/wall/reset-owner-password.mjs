#!/usr/bin/env node
/**
 * Reset the local owner wall password in the Worker D1 database.
 *
 * Usage:
 *   pnpm wall:reset-password 'your-new-password'
 *   pnpm wall:reset-password 'your-new-password' --db path/to/local.sqlite
 *
 * Changing ADMIN_BOOTSTRAP_PASSWORD alone does nothing after the first login.
 * This script replaces admin_credentials.password_hash and increments version,
 * which also invalidates existing owner sessions.
 */
import { randomBytes, scrypt } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultState = join(
  root,
  "workers/portfo/.wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);

function usage(message) {
  if (message) console.error(message);
  console.error(`Usage: pnpm wall:reset-password '<password>' [--db path/to.sqlite]

Password must be 8–128 characters (Unicode length) and at most 512 UTF-8 bytes.
Omitting --db uses the local wrangler D1 file under workers/portfo/.wrangler/state.`);
  process.exit(message ? 1 : 0);
}

function findLocalDb() {
  if (!existsSync(defaultState)) return null;
  const files = readdirSync(defaultState).filter(
    (name) => name.endsWith(".sqlite") && !name.includes("metadata"),
  );
  if (files.length === 1) return join(defaultState, files[0]);
  if (files.length > 1) {
    usage(
      `Multiple D1 files found. Pass one with --db:\n${files.map((f) => `  ${join(defaultState, f)}`).join("\n")}`,
    );
  }
  return null;
}

function validPassword(value) {
  if (typeof value !== "string" || !value || Buffer.byteLength(value) > 512) return false;
  const count = [...value].length;
  return count >= 8 && count <= 128;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt-v1$${salt.toString("hex")}$${key.toString("hex")}`;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) usage();
const dbFlag = args.indexOf("--db");
let dbPath = null;
if (dbFlag !== -1) {
  dbPath = args[dbFlag + 1];
  if (!dbPath) usage("Missing path after --db.");
  args.splice(dbFlag, 2);
}
const password = args[0];
if (!password || args.length !== 1) usage("Pass exactly one password argument.");
if (!validPassword(password)) usage("Password must be 8–128 characters and ≤ 512 UTF-8 bytes.");

dbPath = resolve(dbPath || findLocalDb() || "");
if (!dbPath || !existsSync(dbPath)) usage("Could not find the local D1 sqlite file. Pass --db.");

const hash = await hashPassword(password);
const sql = `UPDATE admin_credentials
SET password_hash = '${hash}',
    version = version + 1,
    updated_at = unixepoch()
WHERE singleton = 1;
DELETE FROM admin_sessions;
SELECT version AS credential_version FROM admin_credentials WHERE singleton = 1;`;

try {
  const out = execFileSync("sqlite3", [dbPath, sql], { encoding: "utf8" }).trim();
  if (!out) {
    console.error("No admin_credentials row found. Sign in once with ADMIN_BOOTSTRAP_PASSWORD first, or insert a row.");
    process.exit(1);
  }
  console.log(`Owner password reset. credential version=${out}`);
  console.log("Sign in at /login with the new password. Existing sessions were cleared.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
