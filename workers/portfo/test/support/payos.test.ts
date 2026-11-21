import { describe, expect, it } from "vitest";
import { canonicalizePayos, verifyPayosData } from "../../src/support/payos";
import { hmacHex } from "../../src/support/crypto";

describe("PayOS signing", () => {
  it("canonicalizes sorted fields, nulls and arrays", () => {
    expect(canonicalizePayos({ z: null, b: [{ z: 2, a: 1 }], a: "null", c: undefined })).toBe(
      'a=&b=[{"a":1,"z":2}]&z=',
    );
  });
  it("rejects a wrong key or changed data", async () => {
    const data = { orderCode: 123456789, amount: 75000, currency: "VND" };
    const signature = await hmacHex("secret", canonicalizePayos(data));
    expect(await verifyPayosData(data, signature, "secret")).toBe(true);
    expect(await verifyPayosData(data, signature, "other")).toBe(false);
    expect(await verifyPayosData({ ...data, amount: 1 }, signature, "secret")).toBe(false);
  });
});

import { env } from "../env";
import { reserveDonation } from "../../src/support/store";
import { handlePayosWebhook } from "../../src/support/payos";

it("settles a signed late webhook and rejects a wrong signature", async () => {
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
    createdAt: "2026-01-01T00:00:00.000Z",
    payosOrderCode: 123456789,
  });
  await env.DB.prepare(
    "UPDATE support_donations SET status = 'expired' WHERE id = 'donation'",
  ).run();
  const data = {
    orderCode: 123456789,
    amount: 75000,
    currency: "VND",
    code: "00",
    reference: "ref",
    paymentLinkId: "link",
  };
  const signature = await hmacHex("secret", canonicalizePayos(data));
  const webhookEnv = { DB: env.DB, PAYOS_CHECKSUM_KEY: "secret" };
  expect(
    await handlePayosWebhook(
      { success: true, code: "00", data, signature: "0".repeat(64) },
      webhookEnv,
    ),
  ).toBe(403);
  expect(await handlePayosWebhook({ success: true, code: "00", data, signature }, webhookEnv)).toBe(
    200,
  );
  expect(await handlePayosWebhook({ success: true, code: "00", data, signature }, webhookEnv)).toBe(
    200,
  );
  expect(
    (await env.DB.prepare("SELECT status FROM support_donations WHERE id = 'donation'").first())
      ?.status,
  ).toBe("paid");
});

it("accepts the published PayOS signing vector", async () => {
  const data = {
    orderCode: 123,
    amount: 3000,
    description: "VQRIO123",
    accountNumber: "12345678",
    reference: "TF230204212323",
    transactionDateTime: "2023-02-04 18:25:00",
    currency: "VND",
    paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
    code: "00",
    desc: "Thành công",
    counterAccountBankId: "",
    counterAccountBankName: "",
    counterAccountName: "",
    counterAccountNumber: "",
    virtualAccountName: "",
    virtualAccountNumber: "",
  };
  expect(
    await verifyPayosData(
      data,
      "412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03",
      "1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675",
    ),
  ).toBe(true);
});
