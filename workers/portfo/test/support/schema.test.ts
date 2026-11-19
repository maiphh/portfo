import { describe, expect, it } from "vitest";
import { defaultRailForCountry } from "../../../../src/lib/support/pricing";
import { reserveDonation } from "../../src/support/store";
import { validateQuote } from "../../src/support/validation";
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
  });
});
