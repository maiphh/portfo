import { describe, expect, it } from "vitest";
import { toResponse, wantsJson } from "./respond";

describe("contact responses", () => {
  it("uses JSON for fetch requests", async () => {
    const req = new Request("http://x/api/contact", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(wantsJson(req)).toBe(true);
    const res = toResponse(
      { kind: "rate_limited", resetAt: new Date("2026-10-20T00:00:00Z") },
      true,
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      ok: false,
      error: "rate_limited",
      resetAt: "2026-10-20T00:00:00.000Z",
    });
  });

  it("answers a honeypot exactly like a real success", async () => {
    const a = await toResponse({ kind: "honeypot" }, true).json();
    const b = await toResponse({ kind: "accepted", messageId: 1, jobId: 1 }, true).json();
    expect(a).toEqual(b);
  });

  it("renders an accessible HTML page for a plain form POST", async () => {
    const req = new Request("http://x/api/contact", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(wantsJson(req)).toBe(false);
    const res = toResponse(
      { kind: "invalid", fieldErrors: { email: "Check the <email>." } },
      false,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<h1>Check the form</h1>");
    expect(html).toContain("<b>Email:</b> Check the &#60;email&#62;.");
    expect(html).toContain('href="/#contact"');
  });
});
