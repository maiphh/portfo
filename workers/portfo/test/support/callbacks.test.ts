import { describe, expect, it } from "vitest";
import { buildSupportCallbacks, isAllowedCheckoutUrl } from "../../src/support/callbacks";

describe("payment callbacks", () => {
  it("uses the canonical origin and preserves Polar's placeholder", () => {
    const { returnUrl, cancelUrl } = buildSupportCallbacks("https://site.test", "attempt", "polar");
    expect(returnUrl).toBe(
      "https://site.test/support/return?id=attempt&rail=polar&hint=success&checkout_id={CHECKOUT_ID}",
    );
    expect(cancelUrl).toBe("https://site.test/support/return?id=attempt&rail=polar&hint=cancel");
  });
  it("rejects untrusted origins and checkout hosts", () => {
    for (const origin of [
      "http://site.test",
      "https://site.test/path",
      "https://user@site.test",
      "https://site.test?q=x",
    ]) {
      expect(() => buildSupportCallbacks(origin, "id", "payos")).toThrow();
    }
    expect(buildSupportCallbacks("http://localhost:4321", "id", "payos").returnUrl).toContain(
      "localhost:4321",
    );
    expect(isAllowedCheckoutUrl("https://pay.payos.vn/link", "payos")).toBe(true);
    expect(isAllowedCheckoutUrl("https://pay.payos.vn.evil.test/link", "payos")).toBe(false);
    expect(isAllowedCheckoutUrl("https://sandbox.polar.sh/checkout/x", "polar", "sandbox")).toBe(
      true,
    );
    expect(isAllowedCheckoutUrl("https://sandbox.polar.sh/checkout/x", "polar", "production")).toBe(
      false,
    );
  });
});
