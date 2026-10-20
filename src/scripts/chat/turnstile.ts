/**
 * Cloudflare Turnstile for the first message of a chat session. Managed widget with
 * `appearance: interaction-only`: invisible unless Cloudflare needs the visitor to click.
 */
import { ChatHttpError } from "~/lib/chat/client";

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string | undefined;
  remove(id: string): void;
}
type WithTurnstile = Window & { turnstile?: TurnstileApi };

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;
let widget: string | undefined;

function loadApi(): Promise<TurnstileApi> {
  const w = window as WithTurnstile;
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    const t = setTimeout(() => reject(new ChatHttpError("turnstile_unavailable")), 15_000);
    s.onload = () => {
      clearTimeout(t);
      if (w.turnstile) resolve(w.turnstile);
      else reject(new ChatHttpError("turnstile_unavailable"));
    };
    s.onerror = () => {
      clearTimeout(t);
      reject(new ChatHttpError("turnstile_unavailable"));
    };
    document.head.append(s);
  }).catch((e: unknown) => {
    loading = null; // allow a retry
    throw e;
  });
  return loading;
}

/** Resolves a fresh single-use token. `box` shows the widget only if a click is needed. */
export async function turnstileToken(box: HTMLElement, sitekey: string): Promise<string> {
  if (!sitekey) throw new ChatHttpError("not_configured");
  const ts = await loadApi();
  if (widget) {
    try {
      ts.remove(widget);
    } catch {
      /* already gone */
    }
    widget = undefined;
  }
  box.replaceChildren();
  box.hidden = false;
  try {
    return await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new ChatHttpError("turnstile_failed")), 90_000);
      const done = (fn: () => void) => {
        clearTimeout(t);
        fn();
      };
      widget = ts.render(box, {
        sitekey,
        action: "chat",
        theme: "dark",
        size: "flexible",
        appearance: "interaction-only",
        "refresh-expired": "never",
        callback: (token: string) => done(() => resolve(token)),
        "error-callback": () => {
          done(() => reject(new ChatHttpError("turnstile_failed")));
          return true;
        },
        "timeout-callback": () => done(() => reject(new ChatHttpError("turnstile_failed"))),
        "unsupported-callback": () =>
          done(() => reject(new ChatHttpError("turnstile_unavailable"))),
      });
    });
  } finally {
    box.hidden = true;
  }
}
