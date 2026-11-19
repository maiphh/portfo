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
