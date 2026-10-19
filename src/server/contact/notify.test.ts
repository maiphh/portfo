import { describe, expect, it, vi } from "vitest";
import { createResendNotifier, defaultNotifier, formatEmail, RESEND_URL } from "./notify";

const input = {
  messageId: 42,
  name: "Ada\nLovelace",
  email: "ada@example.com",
  body: "We're hiring.",
  category: "recruiter" as const,
  confidence: 0.91,
  createdAt: new Date("2026-10-19T05:00:00Z"),
};

describe("Resend notifier (fake fetch, no network)", () => {
  it("posts the email with reply-to and an idempotency key", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "email_1" }));
    await createResendNotifier({
      apiKey: "re_test",
      to: "phu@example.com",
      fetch: fetch as unknown as typeof globalThis.fetch,
    }).notify(input);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESEND_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["Idempotency-Key"]).toBe("contact-message-42");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      to: ["phu@example.com"],
      reply_to: "ada@example.com",
      subject: "[portfolio] recruiter: Ada Lovelace",
    });
    expect(body.text).toContain("91% confident");
  });

  it("throws on a non-2xx response so the job is retried", async () => {
    const fetch = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const n = createResendNotifier({
      apiKey: "k",
      to: "t@example.com",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await expect(n.notify(input)).rejects.toThrow(/429/);
  });

  it("fails loudly when RESEND_API_KEY or NOTIFY_EMAIL is missing", async () => {
    await expect(defaultNotifier({}).notify(input)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("keeps the subject on one line", () => {
    expect(formatEmail(input).subject).not.toMatch(/\n/);
  });
});
