/**
 * Maps a submit result to JSON (enhanced form) or a small HTML page (no-JS form POST).
 */
import type { SubmitResult } from "./submit";

export const SITE_NAME = "Mai Gia Phu";
export const SITE_EMAIL = "maiphh29@gmail.com";

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
        status: 200,
        ok: true,
        json: { ok: true, status: "sent" },
        title: "Message sent",
        lead: "Thanks. I'll read it myself.",
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
    case "email_failed":
      return {
        status: 502,
        ok: false,
        json: { ok: false, error: "email_failed" },
        title: "Couldn't send the message",
        lead: "Your message was saved, but the email could not be sent. Please email me directly.",
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

export function renderResultPage(v: View, siteOrigin: string | null): string {
  const errors = v.errors?.length
    ? `<ul>${v.errors.map(([f, m]) => `<li><b>${esc(f)}:</b> ${esc(m)}</li>`).join("")}</ul>`
    : "";
  const back = siteOrigin ? `${siteOrigin}/#contact` : "/#contact";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(v.title)} · ${esc(SITE_NAME)}</title>
<style>
  :root { color-scheme: dark; }
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; min-height: 100svh; display: grid; place-items: center; background: #141414;
    color: #f1f1ec; font: 1.0625rem/1.6 system-ui, sans-serif; padding: 16px; overflow-wrap: anywhere; }
  main { width: 100%; max-width: 34rem; background: #1b1b1a; border: 1px solid #3d3d39; border-radius: 10px;
    padding: clamp(20px, 6vw, 32px); }
  .tag { display: inline-block; font: 600 0.8rem/1 ui-monospace, monospace; padding: 6px 8px; border-radius: 4px;
    background: ${v.ok ? "#d4f56b" : "#ff9d8a"}; color: #141414; }
  h1 { font-size: 1.75rem; line-height: 1.2; margin: 16px 0 8px; }
  ul { padding-left: 1.2em; } li { margin: 6px 0; }
  a { color: #d4f56b; } a:focus-visible { outline: 2px solid #d4f56b; outline-offset: 3px; }
  .actions { display: flex; flex-wrap: wrap; column-gap: 20px; row-gap: 4px; margin: 20px 0 0; }
  .actions a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 2px; }
</style>
</head>
<body>
<main>
  <span class="tag">${v.ok ? "Sent" : "Not sent"}</span>
  <h1>${esc(v.title)}</h1>
  <p>${esc(v.lead)}</p>
  ${errors}
  <p class="actions">
    <a href="${esc(back)}">${v.ok ? "Back to the site" : "Back to the form"}</a>
    <a href="mailto:${esc(SITE_EMAIL)}">${esc(SITE_EMAIL)}</a>
  </p>
</main>
</body>
</html>`;
}

export function toResponse(
  result: SubmitResult | { kind: "error" } | { kind: "too_large" },
  json: boolean,
  siteOrigin: string | null,
): Response {
  const v = view(result);
  const headers = { "Cache-Control": "no-store" };
  if (json) return Response.json(v.json, { status: v.status, headers });
  return new Response(renderResultPage(v, siteOrigin), {
    status: v.ok ? 200 : v.status,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}
