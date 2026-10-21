import { describe, expect, it } from "vitest";
import { workList } from "../src/work";
import { env } from "./env";
import { call, ORIGIN, testEnv } from "./helpers";

const slug = workList[0]?.slug ?? "craftland";

function viewRequest(
  body: unknown,
  opts: { ip?: string; ua?: string; origin?: string | null } = {},
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "CF-Connecting-IP": opts.ip ?? "203.0.113.20",
    "User-Agent": opts.ua ?? "Mozilla/5.0 (test)",
  };
  if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
  return new Request("https://api.test/view", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /view", () => {
  it("records once and returns 202 on the same visitor+slug+day", async () => {
    const { res: first } = await call(viewRequest({ slug }));
    expect(first.status).toBe(204);
    const { res: second } = await call(viewRequest({ slug }));
    expect(second.status).toBe(202);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM page_views").first<{
      n: number;
    }>();
    expect(count?.n).toBe(1);
  });

  it("rejects an unknown slug with 400", async () => {
    const { res } = await call(viewRequest({ slug: "not-a-real-project" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "unknown_slug" });
  });

  it("ignores bots with 202 and stores nothing", async () => {
    const { res } = await call(viewRequest({ slug }, { ua: "Googlebot/2.1" }));
    expect(res.status).toBe(202);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM page_views").first<{
      n: number;
    }>();
    expect(count?.n).toBe(0);
  });

  it("returns 503 when salt is missing in production", async () => {
    const { res } = await call(
      viewRequest({ slug }),
      testEnv({ ENVIRONMENT: "production", VISITOR_HASH_SALT: undefined }),
    );
    expect(res.status).toBe(503);
  });
});
