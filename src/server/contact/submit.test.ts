import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, memoryLogger, rows, truncate } from "../../../test/db";
import { contactMessages, jobs } from "~/db/schema";
import { submitContact, type SubmitDeps } from "./submit";

const h = connect();
const db = h.db;
afterAll(() => h.close());
beforeEach(() => truncate(h, "contact_messages", "jobs", "rate_limits"));

const form = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "We're hiring an AI engineer in HCMC.",
  role: "recruiter",
};
const meta = { ip: "203.0.113.7", userAgent: "vitest" };
const devEnv = { NODE_ENV: "test", VISITOR_HASH_SALT: "test-salt" };

function deps(
  over: Partial<SubmitDeps> = {},
): SubmitDeps & { log: ReturnType<typeof memoryLogger> } {
  return { db, env: devEnv, log: memoryLogger(), ...over } as SubmitDeps & {
    log: ReturnType<typeof memoryLogger>;
  };
}

describe("submitContact", () => {
  it("stores the message and a classify_and_notify job in one go", async () => {
    const d = deps();
    const r = await submitContact(form, meta, d);
    expect(r.kind).toBe("accepted");
    if (r.kind !== "accepted") return;

    const [msg] = await db.select().from(contactMessages);
    expect(msg).toMatchObject({
      id: r.messageId,
      name: "Ada Lovelace",
      email: "ada@example.com",
      status: "new",
      category: null,
    });
    expect(msg?.visitorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(msg?.visitorHash).not.toContain("203.0.113.7");

    const [job] = await db.select().from(jobs);
    expect(job).toMatchObject({
      id: r.jobId,
      type: "classify_and_notify",
      status: "queued",
      payload: { messageId: r.messageId, roleHint: "recruiter" },
    });
    // Dev/test without a Turnstile key: skipped, and says so.
    expect(d.log.lines.some((l) => /TURNSTILE_SECRET_KEY is not set; skipping/.test(l.text))).toBe(
      true,
    );
  });

  it("rolls back the message if the job insert fails", async () => {
    await h.db.execute(sql`
      create or replace function portfo_test_reject() returns trigger language plpgsql as
      $$ begin raise exception 'job insert rejected (test)'; end $$`);
    await h.db.execute(sql`
      create trigger portfo_test_reject before insert on jobs
      for each row execute function portfo_test_reject()`);
    try {
      await expect(submitContact(form, meta, deps())).rejects.toThrow();
      expect(await db.select().from(contactMessages)).toEqual([]);
      expect(await db.select().from(jobs)).toEqual([]);
    } finally {
      await h.db.execute(sql`drop trigger portfo_test_reject on jobs`);
      await h.db.execute(sql`drop function portfo_test_reject()`);
    }
  });

  it("drops honeypot submissions without storing anything", async () => {
    const r = await submitContact({ ...form, website: "https://spam.example" }, meta, deps());
    expect(r).toEqual({ kind: "honeypot" });
    expect(await db.select().from(contactMessages)).toEqual([]);
    expect(await db.select().from(jobs)).toEqual([]);
    const counters = await rows(h, sql`select * from rate_limits`);
    expect(counters).toEqual([]);
  });

  it("returns field errors and stores nothing for invalid input", async () => {
    const r = await submitContact({ ...form, email: "ada" }, meta, deps());
    expect(r).toEqual({
      kind: "invalid",
      fieldErrors: { email: "Check the email address. It needs an @ and a domain." },
    });
    expect(await db.select().from(contactMessages)).toEqual([]);
  });

  it("allows 3 posts per visitor per day, then rate-limits", async () => {
    const now = new Date("2026-10-19T05:00:00Z");
    const kinds = [];
    for (let i = 0; i < 4; i++) kinds.push((await submitContact(form, meta, deps({ now }))).kind);
    expect(kinds).toEqual(["accepted", "accepted", "accepted", "rate_limited"]);
    expect(await db.select().from(contactMessages)).toHaveLength(3);

    // A different visitor (IP) is unaffected, and so is the same visitor the next day.
    const other = await submitContact(form, { ...meta, ip: "198.51.100.1" }, deps({ now }));
    expect(other.kind).toBe("accepted");
    const tomorrow = await submitContact(
      form,
      meta,
      deps({ now: new Date("2026-10-20T05:00:00Z") }),
    );
    expect(tomorrow.kind).toBe("accepted");
  });

  it("verifies the Turnstile token when TURNSTILE_SECRET_KEY is set", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      const success = body.get("response") === "good-token";
      return Response.json({ success, "error-codes": success ? [] : ["invalid-input-response"] });
    });
    const env = { ...devEnv, TURNSTILE_SECRET_KEY: "test-secret" };
    const d = deps({ env, fetch: fetch as unknown as typeof globalThis.fetch });

    expect((await submitContact(form, meta, d)).kind).toBe("captcha_failed"); // no token
    expect(fetch).not.toHaveBeenCalled();
    const bad = await submitContact({ ...form, "cf-turnstile-response": "bad" }, meta, d);
    expect(bad.kind).toBe("captcha_failed");
    const ok = await submitContact({ ...form, "cf-turnstile-response": "good-token" }, meta, d);
    expect(ok.kind).toBe("accepted");

    const body = fetch.mock.calls[1]?.[1]?.body as URLSearchParams;
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("fails closed when Turnstile verification errors", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const env = { ...devEnv, TURNSTILE_SECRET_KEY: "test-secret" };
    const r = await submitContact(
      { ...form, "cf-turnstile-response": "t" },
      meta,
      deps({ env, fetch: fetch as unknown as typeof globalThis.fetch }),
    );
    expect(r.kind).toBe("captcha_failed");
  });

  it.each([{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production" }])(
    "fails closed in production without TURNSTILE_SECRET_KEY (%o)",
    async (env) => {
      const d = deps({ env: { ...env, VISITOR_HASH_SALT: "s" } });
      const r = await submitContact(form, meta, d);
      expect(r).toEqual({ kind: "unavailable", reason: "turnstile_not_configured" });
      expect(await db.select().from(contactMessages)).toEqual([]);
      expect(d.log.lines.some((l) => l.level === "error" && /fail closed/.test(l.text))).toBe(true);
    },
  );

  it("fails closed in production without VISITOR_HASH_SALT", async () => {
    const fetch = (async () =>
      Response.json({ success: true })) as unknown as typeof globalThis.fetch;
    const env = { NODE_ENV: "production", TURNSTILE_SECRET_KEY: "k" };
    const r = await submitContact(
      { ...form, "cf-turnstile-response": "t" },
      meta,
      deps({ env, fetch }),
    );
    expect(r).toEqual({ kind: "unavailable", reason: "visitor_salt_not_configured" });
  });
});
