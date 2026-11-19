import { describe, expect, it } from "vitest";
import { signReviewToken, verifyReviewToken } from "../../src/support/tokens";
describe("review token signatures", () => {
  it("rejects tampered, wrong-key and expired claims", async () => {
    const claims = { id: "token", donationId: "donation", expiresAt: "2030-01-01T00:00:00.000Z" };
    const token = await signReviewToken(claims, "secret");
    expect(await verifyReviewToken(token, "secret", 0)).toEqual(claims);
    expect(await verifyReviewToken(token + "x", "secret", 0)).toBeNull();
    expect(await verifyReviewToken(token, "wrong", 0)).toBeNull();
    expect(await verifyReviewToken(token, "secret", Date.parse(claims.expiresAt))).toBeNull();
    expect(await verifyReviewToken("invalid", "secret", 0)).toBeNull();
  });
});
