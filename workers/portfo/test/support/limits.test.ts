import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../env";
import { checkSupportLimit, supportIpDigest } from "../../src/support/limits";
import { verifyTurnstile } from "../../src/support/turnstile";

afterEach(() => vi.restoreAllMocks());

describe("support abuse controls", () => {
  it("enforces the shared limit atomically", async () => {
    const digest = await supportIpDigest("127.0.0.1", "test-salt");
    const admitted = await Promise.all(
      Array.from({ length: 10 }, () =>
        checkSupportLimit(env.DB, "pay", digest, 5, 3600, 1700000000000),
      ),
    );
    expect(admitted.filter(Boolean)).toHaveLength(5);
    expect(await supportIpDigest("127.0.0.1", "another-salt")).not.toBe(digest);
  });
  it("checks the Turnstile action and hostname and fails closed", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    fetcher.mockResolvedValueOnce(
      Response.json({ success: true, action: "support_pay", hostname: "site.test" }),
    );
    expect(await verifyTurnstile("token", "secret", "https://site.test", "support_pay")).toBe(true);
    const options = fetcher.mock.calls[0]?.[1];
    expect(JSON.parse(String(options?.body))).toEqual({ secret: "secret", response: "token" });
    fetcher.mockResolvedValueOnce(
      Response.json({ success: true, action: "support_review", hostname: "site.test" }),
    );
    expect(await verifyTurnstile("token", "secret", "https://site.test", "support_pay")).toBe(
      false,
    );
    fetcher.mockResolvedValueOnce(
      Response.json({ success: true, action: "support_pay", hostname: "evil.test" }),
    );
    expect(await verifyTurnstile("token", "secret", "https://site.test", "support_pay")).toBe(
      false,
    );
    fetcher.mockRejectedValueOnce(new Error("unavailable"));
    expect(await verifyTurnstile("token", "secret", "https://site.test", "support_pay")).toBe(
      false,
    );
  });
});
