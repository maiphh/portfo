import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../env";
import { sha256Hex } from "../../src/http";
import { handleSupport } from "../../src/support/routes";
import { cleanupSupport } from "../../src/support/store";

const config = {
  ...env,
  SUPPORT_SITE_ORIGIN: "https://site.test",
  SUPPORT_IP_HASH_SALT: "salt",
  TURNSTILE_SECRET_KEY: "secret",
  SUPPORT_REVIEW_SIGNING_KEY: "signing",
  SUPPORT_ADMIN_TOKEN: "admin",
  SUPPORT_READ_LIMITER: { limit: async () => ({ success: true }) },
};
const key = "A".repeat(43),
  donationId = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function request(path: string, body?: unknown, auth?: string, ip = "192.0.2.1") {
  return handleSupport(
    new Request(`https://worker${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": ip,
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    config,
  );
}
const submit = (n: number, token?: string) =>
  request("/api/support/review", {
    submissionId: id(n),
    submissionKey: key,
    text: "A thoughtful public note",
    turnstileToken: "challenge",
    ...(token !== undefined ? { reviewToken: token } : {}),
  });
async function paid() {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO support_donations (id,receipt_key_hash,request_fingerprint,rail,currency,amount_minor,display_name,private_message,status,created_at,updated_at,paid_at) VALUES (?,?,?,'polar','USD',300,'Donor','private words','paid',?,?,?)",
  )
    .bind(donationId, await sha256Hex(key), "fingerprint", now, now, now)
    .run();
}
function challenge() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ success: true, hostname: "site.test", action: "support_review" }),
    ),
  );
}
afterEach(() => vi.unstubAllGlobals());
describe("review queue and moderation", () => {
  it("claims one token, survives retries, and publishes only approved content", async () => {
    challenge();
    await paid();
    expect(
      (await request(`/api/support/review-token/${donationId}`, {}, "B".repeat(43))).status,
    ).toBe(404);
    const first = (await (
      await request(`/api/support/review-token/${donationId}`, {}, key)
    ).json()) as { reviewToken: string };
    const again = (await (
      await request(`/api/support/review-token/${donationId}`, {}, key)
    ).json()) as { reviewToken: string };
    expect(first.reviewToken).toBe(again.reviewToken);
    const race = await Promise.all([submit(1, first.reviewToken), submit(2, first.reviewToken)]);
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
    const winner = race[0]?.status === 201 ? 1 : 2;
    expect((await submit(winner, first.reviewToken)).status).toBe(200);
    expect((await submit(3)).status).toBe(201);
    expect((await request(`/api/support/review-token/${donationId}`, {}, key)).status).toBe(410);
    const before = (await (await request("/api/support/wall")).json()) as {
      reviews: unknown[];
      supporters: unknown[];
    };
    expect(before.reviews).toHaveLength(0);
    expect(JSON.stringify(before)).not.toContain("private words");
    expect(
      (await request(`/api/support/admin/reviews/${id(winner)}`, { action: "approve" })).status,
    ).toBe(401);
    expect(
      (await request(`/api/support/admin/reviews/${id(winner)}`, { action: "approve" }, "admin"))
        .status,
    ).toBe(200);
    expect(
      (await request(`/api/support/admin/reviews/${id(winner)}`, { action: "approve" }, "admin"))
        .status,
    ).toBe(200);
    const wall = (await (await request("/api/support/wall")).json()) as {
      reviews: { supporter: boolean }[];
    };
    expect(wall.reviews).toHaveLength(1);
    expect(wall.reviews[0]?.supporter).toBe(true);
    expect(
      JSON.stringify(
        await (await request("/api/support/admin/donations", undefined, "admin")).json(),
      ),
    ).toContain("private words");
    expect(
      (
        await request(
          `/api/support/admin/donations/${donationId}`,
          { action: "hide_supporter" },
          "admin",
        )
      ).status,
    ).toBe(200);
    expect(
      ((await (await request("/api/support/wall")).json()) as { supporters: unknown[] }).supporters,
    ).toHaveLength(0);
    expect(
      (await request(`/api/support/admin/reviews/${id(winner)}`, { action: "hide" }, "admin"))
        .status,
    ).toBe(200);
    expect(
      ((await (await request("/api/support/wall")).json()) as { reviews: unknown[] }).reviews,
    ).toHaveLength(0);
  });
  it("enforces the pending cap under concurrency and rejects token tampering", async () => {
    challenge();
    await paid();
    const { reviewToken } = (await (
      await request(`/api/support/review-token/${donationId}`, {}, key)
    ).json()) as { reviewToken: string };
    expect((await submit(10, reviewToken + "x")).status).toBe(409);
    expect((await submit(10, "")).status).toBe(409);
    const result = await Promise.all([11, 12, 13, 14, 15].map((n) => submit(n)));
    expect(result.filter((r) => r.status === 201)).toHaveLength(3);
    expect((await submit(16, reviewToken)).status).toBe(429);
    expect((await request(`/api/support/review-token/${donationId}`, {}, key)).status).toBe(200);
  });
  it("fails closed for wrong review challenge action and hostname", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: true, hostname: "site.test", action: "support_pay" }),
      ),
    );
    expect((await submit(30)).status).toBe(403);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: true, hostname: "other.test", action: "support_review" }),
      ),
    );
    expect((await submit(30)).status).toBe(403);
  });
  it("cleans sensitive content without deleting payment records", async () => {
    await paid();
    challenge();
    await submit(20);
    await env.DB.prepare(
      "UPDATE support_reviews SET status='rejected', moderated_at='2020-01-01T00:00:00.000Z', created_at='2020-01-01T00:00:00.000Z'",
    ).run();
    await env.DB.prepare(
      "UPDATE support_donations SET paid_at='2020-01-01T00:00:00.000Z', created_at='2020-01-01T00:00:00.000Z'",
    ).run();
    await cleanupSupport(env.DB);
    expect(
      await env.DB.prepare("SELECT body,ip_digest FROM support_reviews").first(),
    ).toMatchObject({ body: "", ip_digest: null });
    expect(
      await env.DB.prepare("SELECT status,private_message FROM support_donations").first(),
    ).toMatchObject({ status: "paid", private_message: null });
  });
});
