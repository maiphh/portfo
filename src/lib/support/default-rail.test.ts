import { describe, expect, it } from "vitest";
import type { APIContext } from "astro";
import { GET } from "../../pages/api/support/default-rail";

describe("support default rail", () => {
  it.each([
    [" vn ", "payos"],
    ["US", "polar"],
    [null, "polar"],
  ])("suggests a rail for country %s", async (country, expected) => {
    const headers = new Headers();
    if (country !== null) headers.set("x-vercel-ip-country", country);
    const response = await GET({
      request: new Request("https://example.com", { headers }),
    } as APIContext);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ defaultRail: expected });
  });
});
