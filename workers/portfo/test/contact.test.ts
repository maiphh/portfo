import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "./env";
import { call, contactRequest, mockResend } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const good = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "Hello, I'd like to talk about a role.",
};

describe("POST /contact", () => {
  it("stores a row and calls Resend once on the happy path", async () => {
    const { seen } = mockResend(true);
    const { res } = await call(contactRequest({ ...good }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "sent" });

    const row = await env.DB.prepare(
      "SELECT name, email, body, role FROM contact_messages",
    ).first();
    expect(row).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      body: good.message,
      role: null,
    });

    const emails = seen.filter((s) => s.url.includes("api.resend.com"));
    expect(emails).toHaveLength(1);
    expect(emails[0]?.headers.get("Idempotency-Key")).toMatch(/^contact-message-\d+$/);
    const payload = JSON.parse(emails[0]?.body ?? "{}") as {
      subject: string;
      reply_to: string;
      text: string;
    };
    expect(payload.subject).toBe("[portfolio] Ada Lovelace");
    expect(payload.reply_to).toBe("ada@example.com");
    expect(payload.text).toContain("Reply to this email to answer them directly.");
    expect(payload.text).not.toMatch(/confident|Sorted as/i);
  });

  it("stores the optional role and includes Writing as in the email", async () => {
    const { seen } = mockResend(true);
    await call(contactRequest({ ...good, role: "recruiter" }));
    const row = await env.DB.prepare("SELECT role FROM contact_messages").first<{ role: string }>();
    expect(row?.role).toBe("recruiter");
    const body = seen.find((s) => s.url.includes("resend"))?.body ?? "";
    expect(body).toContain("Writing as: recruiter");
  });

  it("honeypot stores nothing and does not email", async () => {
    const { seen } = mockResend(true);
    const { res } = await call(
      contactRequest({ ...good, website: "http://spam.test" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "sent" });
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM contact_messages").first<{
      n: number;
    }>();
    expect(count?.n).toBe(0);
    expect(seen.filter((s) => s.url.includes("resend"))).toHaveLength(0);
  });

  it("returns 400 with field errors on bad input", async () => {
    mockResend(true);
    const { res } = await call(
      contactRequest({ name: "A", email: "bad", message: "hi" }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; fieldErrors: Record<string, string> };
    expect(data.error).toBe("invalid");
    expect(data.fieldErrors.name).toBeTruthy();
    expect(data.fieldErrors.email).toBeTruthy();
    expect(data.fieldErrors.message).toBeTruthy();
  });

  it("keeps the row and returns 502 when Resend fails", async () => {
    mockResend(false);
    const { res } = await call(contactRequest({ ...good }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "email_failed" });
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM contact_messages").first<{
      n: number;
    }>();
    expect(count?.n).toBe(1);
  });

  it("rejects a disallowed browser Origin with 403", async () => {
    mockResend(true);
    const { res } = await call(contactRequest(good, { origin: "https://evil.test" }));
    expect(res.status).toBe(403);
  });
});
