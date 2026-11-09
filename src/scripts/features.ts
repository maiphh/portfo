import { API_MOCK } from "~/lib/api";
import { contactRules, type ContactField } from "~/lib/contact-rules";
import { site } from "~/lib/site";
import { TL_MONTHS, nowIndex } from "~/lib/timeline";
import { $, $$ } from "./dom";

/* ---------- dev panel (?dev) ---------- */
export function initDevPanel() {
  const dev = $("#dev");
  if (!dev) return;
  if (/[?&]dev\b/.test(location.search)) dev.hidden = false;
  $("[data-dev-close]")?.addEventListener("click", () => (dev.hidden = true));
}

/* ---------- 4. contact form (SAMPLE with mocks on; POST Worker /contact with mocks off) ---------- */
export function initContact() {
  const cf = $<HTMLFormElement>("#contact-form");
  const status = $("#q-status");
  if (!cf || !status) return;
  const sendBtn = $<HTMLButtonElement>("button[type=submit]", cf);
  const fields = Object.keys(contactRules) as ContactField[];
  const field = (k: ContactField) =>
    cf.elements.namedItem(k) as HTMLInputElement | HTMLTextAreaElement;
  const errEl = (f: HTMLElement) =>
    document.getElementById(f.getAttribute("aria-describedby") ?? "");
  // JS validates inline with readable messages; without JS the browser and Worker do.
  cf.noValidate = true;

  const validate = () => {
    let first: HTMLElement | null = null;
    for (const k of fields) {
      const f = field(k);
      const msg = contactRules[k](f.value);
      const e = errEl(f);
      if (e) e.textContent = msg;
      f.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg && !first) first = f;
    }
    return first;
  };
  for (const k of fields) {
    const f = field(k);
    f.addEventListener("input", () => {
      if (f.getAttribute("aria-invalid") !== "true") return;
      const msg = contactRules[k](f.value);
      const e = errEl(f);
      if (e) e.textContent = msg;
      f.setAttribute("aria-invalid", msg ? "true" : "false");
    });
  }

  const showFieldErrors = (errors: Partial<Record<string, string>>) => {
    let first: HTMLElement | null = null;
    for (const k of fields) {
      const f = field(k);
      const msg = errors[k] ?? "";
      const e = errEl(f);
      if (e) e.textContent = msg;
      f.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg && !first) first = f;
    }
    return first;
  };

  const sendLive = async () => {
    if (!cf.action) {
      status.textContent = `The form isn't connected yet. Please email ${site.email} instead.`;
      return;
    }
    if (sendBtn) sendBtn.disabled = true;
    cf.setAttribute("aria-busy", "true");
    status.textContent = "Sending…";
    const fallback = `Please email ${site.email} instead.`;
    try {
      const res = await fetch(cf.action, {
        method: "POST",
        body: new FormData(cf),
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fieldErrors?: Partial<Record<string, string>>;
      };
      if (res.ok) {
        const name = field("name").value.trim().split(/\s+/)[0] ?? "";
        status.textContent = `Sent. Thanks, ${name}. I'll read it myself.`;
        cf.reset();
        fields.forEach((k) => field(k).removeAttribute("aria-invalid"));
        return;
      }
      if (res.status === 400 && data.fieldErrors) {
        const bad = showFieldErrors(data.fieldErrors);
        status.textContent = "Fix the highlighted fields and send again.";
        bad?.focus();
        return;
      }
      status.textContent = `Sorry, the message couldn't be sent. ${fallback}`;
    } catch {
      status.textContent = `Sorry, the message couldn't be sent (network error). ${fallback}`;
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      cf.removeAttribute("aria-busy");
    }
  };

  cf.addEventListener("submit", (e) => {
    e.preventDefault();
    const bad = validate();
    if (bad) {
      const many = $$("[aria-invalid=true]", cf).length > 1;
      status.textContent = `Fix the highlighted field${many ? "s" : ""} and send again.`;
      bad.focus();
      return;
    }
    if (!API_MOCK) {
      void sendLive();
      return;
    }
    const name = field("name").value.trim().split(/\s+/)[0] ?? "";
    status.textContent = `Thanks, ${name}. This is a sample: nothing was sent. Email ${site.email} to reach me.`;
    cf.reset();
    fields.forEach((k) => field(k).removeAttribute("aria-invalid"));
  });
}

/* ---------- 6. timeline "now" marker follows the visitor's date, not the build date ---------- */
export function initNowMarker() {
  const el = $(".tl .now");
  if (!el) return;
  el.style.setProperty("--p", (nowIndex() / TL_MONTHS).toFixed(3));
}
