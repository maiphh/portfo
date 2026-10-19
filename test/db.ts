/** Shared helpers for tests that run against a real Postgres + pgvector. */
import { sql, type SQL } from "drizzle-orm";
import { createDb, type DbHandle } from "../src/db/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * TEST_DATABASE_URL, checked to be a local database: the test setup drops and
 * recreates the public schema, so it must never point at a real database.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a throwaway local Postgres with pgvector " +
        "(see the README, Database section).",
    );
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && process.env.TEST_DATABASE_ALLOW_REMOTE !== "1") {
    throw new Error(`Refusing to run tests against non-local host "${host}".`);
  }
  return url;
}

export function connect(): DbHandle {
  return createDb(testDatabaseUrl());
}

export async function truncate(handle: DbHandle, ...tables: string[]): Promise<void> {
  await handle.db.execute(sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
}

/** Runs raw SQL and returns its rows (node-postgres and Neon both return `{ rows }`). */
export async function rows<T>(handle: DbHandle, query: SQL): Promise<T[]> {
  const result = (await handle.db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

/** A logger that records calls instead of printing. */
export function memoryLogger() {
  const lines: { level: "info" | "warn" | "error"; text: string }[] = [];
  const at =
    (level: "info" | "warn" | "error") =>
    (...args: unknown[]) =>
      lines.push({ level, text: args.map(String).join(" ") });
  return { lines, info: at("info"), warn: at("warn"), error: at("error") };
}
