/**
 * Database client. Server-only: never import this from client-side code.
 *
 * Neon hosts (*.neon.tech) use the @neondatabase/serverless driver over
 * WebSockets, which works in serverless functions and supports transactions.
 * Any other host (local Postgres, CI) uses node-postgres over TCP.
 */
import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

export { schema };

/** Any Drizzle Postgres database built with this schema, whatever the driver. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  /** Closes the connection pool. */
  close: () => Promise<void>;
}

export function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export function createDb(url: string | undefined = process.env.DATABASE_URL): DbHandle {
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example and the README.");
  }
  if (isNeonUrl(url)) {
    const pool = new NeonPool({ connectionString: url });
    return { db: drizzleNeon({ client: pool, schema }), close: () => pool.end() };
  }
  const pool = new pg.Pool({ connectionString: url });
  return { db: drizzlePg({ client: pool, schema }), close: () => pool.end() };
}

let shared: DbHandle | undefined;

/** Lazily created, process-wide client for API routes. */
export function getDb(): Db {
  shared ??= createDb();
  return shared.db;
}
