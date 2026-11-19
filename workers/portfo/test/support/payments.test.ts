import { describe, expect, it } from "vitest";
import { env } from "../env";
import { applyPaymentEvidence, reserveDonation } from "../../src/support/store";

const now = "2026-01-01T00:00:00.000Z";
async function reserve() {
  await reserveDonation(env.DB, {
    id: "donation",
    receiptKeyHash: "hash",
    fingerprint: "fingerprint",
    rail: "payos",
    currency: "VND",
    amountMinor: 75000,
    presetCount: 3,
    displayName: null,
    privateMessage: null,
    createdAt: now,
    payosOrderCode: 123456789,
  });
  await env.DB.prepare("UPDATE support_donations SET status = 'expired' WHERE id = ?")
    .bind("donation")
    .run();
}
const evidence = {
  rail: "payos" as const,
  eventId: "event",
  donationId: "donation",
  amountMinor: 75000,
  currency: "VND" as const,
  providerReference: "ref",
  payosLinkId: "link",
  observedAt: now,
};

describe("payment evidence", () => {
  it("settles late and preserves the original payment time on replay", async () => {
    await reserve();
    await applyPaymentEvidence(env.DB, evidence);
    await applyPaymentEvidence(env.DB, { ...evidence, observedAt: "2026-02-01T00:00:00.000Z" });
    const row = await env.DB.prepare(
      "SELECT status, paid_at, payos_link_id FROM support_donations WHERE id = ?",
    )
      .bind("donation")
      .first();
    expect(row).toMatchObject({ status: "paid", paid_at: now, payos_link_id: "link" });
    const count = await env.DB.prepare("SELECT count(*) AS n FROM support_webhook_events").first();
    expect(count?.n).toBe(1);
  });
  it("records a different payment reference as a mismatch after settlement", async () => {
    await reserve();
    await applyPaymentEvidence(env.DB, evidence);
    await applyPaymentEvidence(env.DB, {
      ...evidence,
      eventId: "second",
      providerReference: "other",
    });
    const event = await env.DB.prepare(
      "SELECT outcome FROM support_webhook_events WHERE event_id = 'second'",
    ).first();
    expect(event?.outcome).toBe("mismatch");
    const row = await env.DB.prepare(
      "SELECT provider_payment_ref FROM support_donations WHERE id = 'donation'",
    ).first();
    expect(row?.provider_payment_ref).toBe("ref");
  });
  it("does not settle mismatched amounts", async () => {
    await reserve();
    await applyPaymentEvidence(env.DB, { ...evidence, amountMinor: 1 });
    const row = await env.DB.prepare("SELECT status FROM support_donations WHERE id = ?")
      .bind("donation")
      .first();
    expect(row?.status).toBe("expired");
    const event = await env.DB.prepare("SELECT outcome FROM support_webhook_events").first();
    expect(event?.outcome).toBe("mismatch");
  });
});

it("commits one payment when independent evidence races", async () => {
  await reserve();
  await Promise.all([
    applyPaymentEvidence(env.DB, evidence),
    applyPaymentEvidence(env.DB, { ...evidence, eventId: "event-2" }),
  ]);
  const row = await env.DB.prepare("SELECT status, paid_at FROM support_donations WHERE id=?")
    .bind("donation")
    .first();
  expect(row).toMatchObject({ status: "paid", paid_at: now });
});

it("leaves no event or payment after a failed settlement batch and accepts redelivery", async () => {
  await reserve();
  const broken = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "batch")
        return async () => {
          throw new Error("injected failure");
        };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await expect(applyPaymentEvidence(broken, evidence)).rejects.toThrow();
  expect(
    (await env.DB.prepare("SELECT status FROM support_donations WHERE id='donation'").first())
      ?.status,
  ).toBe("expired");
  expect(
    (await env.DB.prepare("SELECT count(*) AS n FROM support_webhook_events").first())?.n,
  ).toBe(0);
  await applyPaymentEvidence(env.DB, evidence);
  expect(
    (await env.DB.prepare("SELECT status FROM support_donations WHERE id='donation'").first())
      ?.status,
  ).toBe("paid");
});

import { vi, afterEach } from "vitest";
import { handleSupport } from "../../src/support/routes";
import { canonicalizePayos } from "../../src/support/payos";
import { hmacHex } from "../../src/support/crypto";

afterEach(() => vi.unstubAllGlobals());
it("reserves a single provider checkout on concurrent retries", async () => {
  const id = "9be8db56-9589-447d-a0e9-d35d1dc07c92";
  const key = "A".repeat(43);
  let creates = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("siteverify"))
        return Response.json({ success: true, hostname: "site.test", action: "support_pay" });
      creates++;
      const request = JSON.parse(String(init?.body)) as { orderCode: number; amount: number };
      const data = {
        orderCode: request.orderCode,
        amount: request.amount,
        currency: "VND",
        paymentLinkId: "link",
        checkoutUrl: "https://pay.payos.vn/link",
        qrCode: "qr",
      };
      return Response.json({
        code: "00",
        data,
        signature: await hmacHex("checksum", canonicalizePayos(data)),
      });
    }),
  );
  const config = {
    ...env,
    SUPPORT_PAYOS_ENABLED: "true",
    SUPPORT_SITE_ORIGIN: "https://site.test",
    SUPPORT_IP_HASH_SALT: "salt",
    TURNSTILE_SECRET_KEY: "challenge",
    PAYOS_CLIENT_ID: "client",
    PAYOS_API_KEY: "api",
    PAYOS_CHECKSUM_KEY: "checksum",
  };
  const create = () =>
    handleSupport(
      new Request("https://worker/api/support/pay", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" },
        body: JSON.stringify({
          id,
          receiptKey: key,
          rail: "payos",
          selection: { preset: 3 },
          turnstileToken: "token",
        }),
      }),
      config,
    );
  const responses = await Promise.all([create(), create()]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 202]);
  expect(creates).toBe(1);
  expect((await create()).status).toBe(200);
  expect(creates).toBe(1);
});

it("keeps an uncertain create recheckable without issuing another provider request", async () => {
  const id = "9be8db56-9589-447d-a0e9-d35d1dc07c92";
  const key = "A".repeat(43);
  let creates = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("siteverify"))
        return Response.json({ success: true, hostname: "site.test", action: "support_pay" });
      creates++;
      throw new Error("timeout");
    }),
  );
  const config = {
    ...env,
    SUPPORT_PAYOS_ENABLED: "true",
    SUPPORT_SITE_ORIGIN: "https://site.test",
    SUPPORT_IP_HASH_SALT: "salt",
    TURNSTILE_SECRET_KEY: "challenge",
    PAYOS_CLIENT_ID: "client",
    PAYOS_API_KEY: "api",
    PAYOS_CHECKSUM_KEY: "checksum",
  };
  const create = () =>
    handleSupport(
      new Request("https://worker/api/support/pay", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" },
        body: JSON.stringify({
          id,
          receiptKey: key,
          rail: "payos",
          selection: { preset: 3 },
          turnstileToken: "token",
        }),
      }),
      config,
    );
  expect((await create()).status).toBe(503);
  const replay = await create();
  expect(replay.status).toBe(202);
  expect(await replay.json()).toMatchObject({ status: "creation_unknown" });
  const response = await handleSupport(
    new Request(`https://worker/api/support/status/${id}`, {
      headers: { Authorization: `Bearer ${key}`, "cf-connecting-ip": "192.0.2.1" },
    }),
    config,
  );
  expect(await response.json()).toMatchObject({ status: "creation_unknown" });
  expect(creates).toBe(1);
});

it("limits rejected receipt reads before querying D1", async () => {
  let reads = 0;
  const db = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "prepare")
        return (...args: Parameters<D1Database["prepare"]>) => {
          reads++;
          return target.prepare(...args);
        };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  let calls = 0;
  const config = {
    ...env,
    DB: db,
    SUPPORT_IP_HASH_SALT: "salt",
    SUPPORT_READ_LIMITER: {
      limit: async () => {
        calls++;
        return { success: false };
      },
    },
  };
  for (const path of ["status", "checkout"]) {
    const response = await handleSupport(
      new Request(`https://worker/api/support/${path}/9be8db56-9589-447d-a0e9-d35d1dc07c92`, {
        headers: { Authorization: `Bearer ${"A".repeat(43)}`, "cf-connecting-ip": "192.0.2.1" },
      }),
      config,
    );
    expect(response.status).toBe(429);
  }
  expect(calls).toBe(2);
  expect(reads).toBe(0);
});
