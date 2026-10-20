import { describe, expect, it } from "vitest";
import { saigonDay } from "../src/config";
import { issueSession, verifySession } from "../src/session";

describe("session tokens", () => {
  it("verifies its own tokens and rejects tampered, foreign and expired ones", async () => {
    const { token, session } = await issueSession("k1", 1_000);
    expect(await verifySession("k1", token, 2_000)).toEqual(session);
    expect(await verifySession("k2", token, 2_000)).toBeNull();
    expect(await verifySession("k1", token, session.exp + 1)).toBeNull();
    const [v, p, s] = token.split(".");
    expect(await verifySession("k1", `${v}.${p}x.${s}`, 2_000)).toBeNull();
    expect(await verifySession("k1", undefined)).toBeNull();
    expect(await verifySession("k1", "garbage")).toBeNull();
  });
});

describe("saigonDay", () => {
  it("rolls over at midnight UTC+7", () => {
    expect(saigonDay(Date.parse("2026-10-20T16:59:59Z"))).toBe("2026-10-20");
    expect(saigonDay(Date.parse("2026-10-20T17:00:00Z"))).toBe("2026-10-21");
  });
});
