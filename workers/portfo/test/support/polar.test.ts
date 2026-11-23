import { describe, expect, it } from "vitest";
import { env } from "../env";
import { handleSupport } from "../../src/support/routes";

describe("disabled card rail", () => {
  it.each([
    ["/api/support/pay", JSON.stringify({ rail: "polar" })],
    ["/api/support/webhooks/polar", "{}"],
    ["/api/support/confirm/any", "{}"],
  ])("rejects %s without contacting a provider", async (path, body) => {
    const response = await handleSupport(
      new Request(`https://worker${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      { ...env, SUPPORT_CARD_ENABLED: "true" },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "card_disabled" });
  });
});
