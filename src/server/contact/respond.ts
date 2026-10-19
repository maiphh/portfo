/**
 * Maps a submit result to an HTTP response: JSON for the enhanced form (fetch),
 * or a small accessible HTML page for a plain no-JS form POST.
 */
import { site } from "~/lib/site";
import type { SubmitResult } from "./submit";

export function wantsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  const type = request.headers.get("content-type") ?? "";
  return accept.includes("application/json") || type.includes("application/json");
}

const FIELD_LABELS: Record<string, string> = {
  name: "Your name",
  email: "Email",
  message: "Message",
  role: "You're writing as",
};

interface View {
  status: number;
  json: Record<string, unknown>;
  title: string;
  lead: string;
  errors?: [string, string][];
  ok: boolean;
}

function view(result: SubmitResult | { kind: "error" } | { kind: "too_large" }): View {
  switch (result.kind) {
    case "accepted":
    case "honeypot":
      return {
        status: 202,
        ok: true,
        json: { ok: true, status: "queued" },
        title: "Message sent",
        lead: "Thanks. Your message is in the queue, and I'll read it myself.",
      };
    case "invalid":
      return {
        status: 400,
        ok: false,
        json: { ok: false, error: "invalid", fieldErrors: result.fieldErrors },
        title: "Check the form",
        lead: "A few fields need fixing before the message can be sent.",
        errors: Object.entries(result.fieldErrors).map(([k, v]) => [FIELD_LABELS[k] ?? k, v]),
      };
    case "captcha_failed":
      return {
        status: 403,
        ok: false,
        json: { ok: false, error: "captcha_failed" },
        title: "Couldn't confirm you're human",
        lead: "The anti-spam check didn't pass. Please try again, or email me directly.",
      };
    case "rate_limited":
      return {
        status: 429,
        ok: false,
        json: { ok: false, error: "rate_limited", resetAt: result.resetAt.toISOString() },
        title: "That's 3 messages today",
        lead: "The form takes up to 3 messages a day. Please try again tomorrow, or email me directly.",
      };
    case "too_large":
      return {
        status: 413,
        ok: false,
        json: { ok: false, error: "too_large" },
        title: "Message too long",
        lead: "Please keep the message under 2000 characters.",
      };
    case "unavailable":
    case "error":
      return {
        status: result.kind === "unavailable" ? 503 : 500,
        ok: false,
        json: { ok: false, error: result.kind },
        title: "The form isn't working right now",
        lead: "Sorry, something went wrong on my side. Please email me directly.",
      };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderResultPage(v: View): string {
  const errors = v.errors?.length
    ? `<ul>${v.errors.map(([f, m]) => `<li><b>${esc(f)}:</b> ${esc(m)}</li>`).join("")}</ul>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(v.title)} · ${esc(site.name)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #141414; color: #f1f1ec;
    font: 1.0625rem/1.6 system-ui, sans-serif; padding: 24px; box-sizing: border-box; }
  main { max-width: 34rem; width: 100%; background: #1b1b1a; border: 1px solid #3d3d39; border-radius: 10px; padding: 32px; }
  .tag { display: inline-block; font: 600 0.8rem/1 ui-monospace, monospace; padding: 6px 8px; border-radius: 4px;
    background: ${v.ok ? "#d4f56b" : "#ff9d8a"}; color: #141414; }
  h1 { font-size: 1.75rem; line-height: 1.2; margin: 16px 0 8px; }
  ul { padding-left: 1.2em; } li { margin: 6px 0; }
  a { color: #d4f56b; } a:focus-visible { outline: 2px solid #d4f56b; outline-offset: 3px; }
  .actions { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 24px; }
</style>
</head>
<body>
<main>
  <span class="tag">${v.ok ? "Sent" : "Not sent"}</span>
  <h1>${esc(v.title)}</h1>
  <p>${esc(v.lead)}</p>
  ${errors}
  <p class="actions">
    <a href="/#contact">${v.ok ? "Back to the site" : "Back to the form"}</a>
    <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>
  </p>
</main>
</body>
</html>`;
}

export function toResponse(
  result: SubmitResult | { kind: "error" } | { kind: "too_large" },
  json: boolean,
): Response {
  const v = view(result);
  const headers = { "Cache-Control": "no-store" };
  if (json) return Response.json(v.json, { status: v.status, headers });
  // A plain form POST lands here: show a readable page (200 for success so browsers don't fuss).
  return new Response(renderResultPage(v), {
    status: v.ok ? 200 : v.status,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}
