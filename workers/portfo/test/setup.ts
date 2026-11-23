import { beforeAll, beforeEach } from "vitest";
import migration from "../migrations/0001_init.sql?raw";
import supportMigration from "../migrations/0006_support.sql?raw";
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
  for (const stmt of statements(migration + ";" + supportMigration)) {
    await env.DB.prepare(stmt).run();
  }
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM support_reviews"),
    env.DB.prepare("DELETE FROM support_review_tokens"),
    env.DB.prepare("DELETE FROM support_webhook_events"),
    env.DB.prepare("DELETE FROM support_donations"),
    env.DB.prepare("DELETE FROM support_rate_limits"),
    env.DB.prepare("DELETE FROM contact_messages"),
    env.DB.prepare("DELETE FROM page_views"),
    env.DB.prepare("DELETE FROM github_activity"),
    env.DB.prepare("DELETE FROM github_activity_next"),
    env.DB.prepare("DELETE FROM github_repos"),
    env.DB.prepare("DELETE FROM sync_runs"),
  ]);
});
