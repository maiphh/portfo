import { beforeAll, beforeEach } from "vitest";
import migration from "../migrations/0001_init.sql?raw";
import { env } from "./env";

/** Split a migration into statements D1 exec accepts (no bare comment "statements"). */
function statements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !/^\s*--/.test(line))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

beforeAll(async () => {
  for (const stmt of statements(migration)) {
    await env.DB.prepare(stmt).run();
  }
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM contact_messages"),
    env.DB.prepare("DELETE FROM page_views"),
    env.DB.prepare("DELETE FROM github_activity"),
    env.DB.prepare("DELETE FROM github_activity_next"),
    env.DB.prepare("DELETE FROM github_repos"),
    env.DB.prepare("DELETE FROM sync_runs"),
  ]);
});
