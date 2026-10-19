import { defineConfig } from "drizzle-kit";

// Pick up DATABASE_URL from a local .env when there is one (Node 22+).
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Only `db:migrate` connects; `db:generate` works without a URL.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
