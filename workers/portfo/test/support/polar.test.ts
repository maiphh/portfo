import { describe, expect, it } from "vitest";
import { hmacSha256 } from "../../src/support/crypto";
import { verifyPolarWebhook } from "../../src/support/polar";

describe("Polar webhook authentication", () => {
  it("checks the untouched body, key, and delivery timestamp", async () => {
    const body = '{"type":"order.paid"}';
    const now = 1700000000000;
    const secret = btoa("fixture-secret");
    const mac = await hmacSha256(
      new TextEncoder().encode("fixture-secret"),
      `msg.1700000000.${body}`,
    );
    const headers = new Headers({
      "webhook-id": "msg",
      "webhook-timestamp": "1700000000",
      "webhook-signature": `v1,${btoa(String.fromCharCode(...mac))}`,
    });
    expect(await verifyPolarWebhook(body, headers, secret, now)).toBe(true);
    expect(await verifyPolarWebhook(body + " ", headers, secret, now)).toBe(false);
    expect(await verifyPolarWebhook(body, headers, btoa("wrong"), now)).toBe(false);
    expect(await verifyPolarWebhook(body, headers, secret, now + 301000)).toBe(false);
  });
});

import { env } from "../env";
import { handleSupport } from "../../src/support/routes";
import { reserveDonation } from "../../src/support/store";
import { sha256Hex } from "../../src/http";
import { vi, afterEach } from "vitest";

const id = "1d8580f0-7e6e-4ab1-b065-2f2510a95abe";
const key = "A".repeat(43);
const config = {
  ...env,
  POLAR_ENVIRONMENT: "sandbox",
  POLAR_ACCESS_TOKEN: "test",
  POLAR_ORG_ID: "org",
  POLAR_PRODUCT_ID: "product",
};
afterEach(() => vi.unstubAllGlobals());
it("only settles a bound succeeded checkout after checking amount and product", async () => {
  await reserveDonation(env.DB, {
    id,
    receiptKeyHash: await sha256Hex(key),
    fingerprint: "f",
    rail: "polar",
    currency: "USD",
    amountMinor: 900,
    presetCount: 3,
    displayName: null,
    privateMessage: null,
    createdAt: new Date().toISOString(),
    payosOrderCode: null,
  });
  await env.DB.prepare(
    "UPDATE support_donations SET status = 'pending', polar_checkout_id = 'checkout' WHERE id = ?",
  )
    .bind(id)
    .run();
  const data = {
    id: "checkout",
    product_id: "product",
    product: { organization_id: "org" },
    metadata: { donation_id: id },
    currency: "usd",
    amount: 900,
    discount_amount: 0,
    status: "open",
  };
  const mock = vi.fn(async () => Response.json(data));
  vi.stubGlobal("fetch", mock);
  const confirm = (checkoutId = "checkout") =>
    handleSupport(
      new Request(`https://worker/api/support/confirm/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ checkoutId }),
      }),
      config,
    );
  expect((await confirm("wrong")).status).toBe(409);
  expect(mock).not.toHaveBeenCalled();
  expect((await confirm()).status).toBe(202);
  data.status = "confirmed";
  expect((await confirm()).status).toBe(202);
  data.status = "succeeded";
  data.amount = 901;
  expect((await confirm()).status).toBe(409);
  data.amount = 900;
  data.product_id = "wrong";
  expect((await confirm()).status).toBe(409);
  data.product_id = "product";
  expect((await confirm()).status).toBe(200);
  expect(
    (await env.DB.prepare("SELECT status FROM support_donations WHERE id=?").bind(id).first())
      ?.status,
  ).toBe("paid");
});

import { handlePolarWebhook } from "../../src/support/polar";
it("settles a signed late order once and rejects mismatched order evidence", async () => {
  const secret = btoa("fixture-secret");
  await reserveDonation(env.DB, {
    id,
    receiptKeyHash: "h",
    fingerprint: "f",
    rail: "polar",
    currency: "USD",
    amountMinor: 900,
    presetCount: 3,
    displayName: null,
    privateMessage: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    payosOrderCode: null,
  });
  await env.DB.prepare(
    "UPDATE support_donations SET status='expired', polar_checkout_id='checkout' WHERE id=?",
  )
    .bind(id)
    .run();
  const data = {
    id: "order",
    checkout_id: "checkout",
    status: "paid",
    paid: true,
    metadata: { donation_id: id },
    product_id: "product",
    product: { organization_id: "org" },
    currency: "usd",
    subtotal_amount: 900,
    net_amount: 900,
    discount_amount: 0,
  };
  const deliver = async (eventId: string) => {
    const body = JSON.stringify({ type: "order.paid", api_version: "2026-10", data });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const mac = await hmacSha256(
      new TextEncoder().encode("fixture-secret"),
      `${eventId}.${timestamp}.${body}`,
    );
    const headers = new Headers({
      "webhook-id": eventId,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${btoa(String.fromCharCode(...mac))}`,
    });
    return handlePolarWebhook(body, headers, { ...config, POLAR_WEBHOOK_SECRET: secret });
  };
  data.net_amount = 899;
  expect(await deliver("bad")).toBe(200);
  expect(
    (await env.DB.prepare("SELECT status FROM support_donations WHERE id=?").bind(id).first())
      ?.status,
  ).toBe("expired");
  data.net_amount = 900;
  expect(await deliver("good")).toBe(200);
  expect(await deliver("good")).toBe(200);
  expect(
    (await env.DB.prepare("SELECT status FROM support_donations WHERE id=?").bind(id).first())
      ?.status,
  ).toBe("paid");
  expect(
    (await env.DB.prepare("SELECT count(*) AS n FROM support_webhook_events").first())?.n,
  ).toBe(1);
});

it("a signed delivery racing the authenticated return preserves one paid donation", async () => {
  await reserveDonation(env.DB, {
    id,
    receiptKeyHash: await sha256Hex(key),
    fingerprint: "f",
    rail: "polar",
    currency: "USD",
    amountMinor: 900,
    presetCount: 3,
    displayName: null,
    privateMessage: null,
    createdAt: new Date().toISOString(),
    payosOrderCode: null,
  });
  await env.DB.prepare(
    "UPDATE support_donations SET status='pending', polar_checkout_id='checkout' WHERE id=?",
  )
    .bind(id)
    .run();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        id: "checkout",
        product_id: "product",
        product: { organization_id: "org" },
        metadata: { donation_id: id },
        currency: "usd",
        amount: 900,
        discount_amount: 0,
        status: "succeeded",
      }),
    ),
  );
  const data = {
    id: "order",
    checkout_id: "checkout",
    status: "paid",
    paid: true,
    metadata: { donation_id: id },
    product_id: "product",
    product: { organization_id: "org" },
    currency: "usd",
    subtotal_amount: 900,
    net_amount: 900,
    discount_amount: 0,
  };
  const body = JSON.stringify({ type: "order.paid", api_version: "2026-10", data });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const mac = await hmacSha256(
    new TextEncoder().encode("fixture-secret"),
    `event.${timestamp}.${body}`,
  );
  const headers = new Headers({
    "webhook-id": "event",
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${btoa(String.fromCharCode(...mac))}`,
  });
  const request = new Request(`https://worker/api/support/confirm/${id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ checkoutId: "checkout" }),
  });
  const [delivery, confirmation] = await Promise.all([
    handlePolarWebhook(body, headers, { ...config, POLAR_WEBHOOK_SECRET: btoa("fixture-secret") }),
    handleSupport(request, config),
  ]);
  expect(delivery).toBe(200);
  expect(confirmation.status).toBe(200);
  expect(
    (
      await env.DB.prepare(
        "SELECT count(*) AS n FROM support_donations WHERE status='paid'",
      ).first()
    )?.n,
  ).toBe(1);
});
