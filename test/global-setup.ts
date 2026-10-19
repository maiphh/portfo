/** Resets the test database and applies the real migrations from ./drizzle once per run. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { testDatabaseUrl } from "./db";

export default async function setup(): Promise<void> {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  try {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
    await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
