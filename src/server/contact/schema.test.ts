import { describe, expect, it } from "vitest";
import { parseContact } from "./schema";

const good = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "Hello, I'd like to talk.",
};

describe("contact validation", () => {
  it("accepts a valid message and trims it", () => {
    const r = parseContact({ ...good, name: "  Ada  ", role: "recruiter" });
    expect(r).toEqual({ ok: true, data: { ...good, name: "Ada", role: "recruiter" } });
  });

  it("treats an empty role as not given", () => {
    const r = parseContact({ ...good, role: "" });
    expect(r.ok && r.data.role).toBe(undefined);
  });

  it("returns one readable error per field", () => {
    const r = parseContact({ name: "A", email: "nope", message: "short", role: "boss" });
    expect(r).toEqual({
      ok: false,
      fieldErrors: {
        name: "Add your name (2 characters or more).",
        email: "Check the email address. It needs an @ and a domain.",
        message: "Add a little more (10 characters or more).",
        role: "Pick one of the options.",
      },
    });
  });

  it("caps the message at 2000 characters", () => {
    expect(parseContact({ ...good, message: "x".repeat(2000) }).ok).toBe(true);
    const r = parseContact({ ...good, message: "x".repeat(2001) });
    expect(!r.ok && r.fieldErrors.message).toMatch(/under 2000/);
  });

  it("rejects missing and non-string fields", () => {
    const r = parseContact({ name: 42 });
    expect(r.ok).toBe(false);
    expect(!r.ok && Object.keys(r.fieldErrors).sort()).toEqual(["email", "message", "name"]);
  });
});
