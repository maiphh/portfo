import { describe, expect, it } from "vitest";
import { defaultRailForCountry } from "../../../../src/lib/support/pricing";
import { reserveDonation } from "../../src/support/store";
import { normalizeSupportText, validateQuote } from "../../src/support/validation";
import { env } from "../env";

describe("support foundation", () => {
  it("quotes only valid money amounts and presets", () => {
    expect(validateQuote("payos", { preset: 3 })).toEqual({
      currency: "VND",
      amountMinor: 75000,
      presetCount: 3,
    });
    expect(validateQuote("polar", { customAmountMinor: 200 })).toEqual({
      currency: "USD",
      amountMinor: 200,
      presetCount: null,
    });
    for (const value of [199, 201, 50100, -100, 1.5])
      expect(validateQuote("polar", { customAmountMinor: value })).toBeNull();
    expect(validateQuote("payos", { preset: 2 })).toBeNull();
    expect(validateQuote("payos", { preset: 1, customAmountMinor: 10000 })).toBeNull();
    expect(defaultRailForCountry(" vn ")).toBe("payos");
    expect(defaultRailForCountry(null)).toBe("polar");
  });

  it("admits only one concurrent reservation for an id", async () => {
    const donation = {
      id: crypto.randomUUID(),
      receiptKeyHash: "hash",
      fingerprint: "fingerprint",
      rail: "payos" as const,
      currency: "VND" as const,
      amountMinor: 25000,
      presetCount: 1,
      displayName: null,
      privateMessage: null,
      createdAt: new Date().toISOString(),
      payosOrderCode: 123456789,
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reserveDonation(env.DB, donation)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await reserveDonation(env.DB, { ...donation, payosOrderCode: 987654321 })).toBe(false);
    expect(await reserveDonation(env.DB, { ...donation, id: crypto.randomUUID() })).toBe(false);
    expect(
      await reserveDonation(env.DB, {
        ...donation,
        id: crypto.randomUUID(),
        payosOrderCode: 987654321,
      }),
    ).toBe(true);
  });

  it("rejects null primary keys and non-integer rate counters", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO support_donations (id, receipt_key_hash, request_fingerprint, rail, currency,
          amount_minor, status, created_at, updated_at) VALUES (NULL, 'h', 'f', 'polar', 'USD', 300, 'creating', 'now', 'now')`,
      ).run(),
    ).rejects.toThrow(/NOT NULL/i);
    await expect(
      env.DB.prepare(
        "INSERT INTO support_review_tokens (id, donation_id, issued_at, expires_at) VALUES (NULL, 'missing', 'now', 'later')",
      ).run(),
    ).rejects.toThrow(/NOT NULL/i);
    await expect(
      env.DB.prepare(
        "INSERT INTO support_reviews (id, submission_key_hash, request_fingerprint, body, status, created_at) VALUES (NULL, 'h', 'f', 'body', 'pending', 'now')",
      ).run(),
    ).rejects.toThrow(/NOT NULL/i);
    for (const counter of [1.5, "text"]) {
      await expect(
        env.DB.prepare(
          "INSERT INTO support_rate_limits (scope, key_digest, window_start, counter) VALUES ('test', 'key', 'now', ?)",
        )
          .bind(counter)
          .run(),
      ).rejects.toThrow();
    }
  });

  it("rejects control characters before trimming support text", () => {
    expect(normalizeSupportText("\thello", 40)).toBeNull();
    expect(normalizeSupportText("hello\t", 40)).toBeNull();
    expect(normalizeSupportText("hello\u0085world", 40)).toBeNull();
    expect(normalizeSupportText("hello\nworld", 40, true)).toBe("hello\nworld");
    expect(normalizeSupportText("hello\nworld", 40)).toBeNull();
  });
});
