/**
 * Always-loaded part of the chat window (small): the launcher, `data-chat-open` triggers, the
 * `/` shortcut, `window.portfoChat`, and the launcher's content-cover tuck. The panel code
 * (./panel) loads on first use, or when the browser is idle after the visitor shows intent.
 */
import type { PortfoChatApi } from "~/lib/chat/events";
import type { Phase } from "~/lib/chat/state";
import { coversContent } from "./content";

type Panel = typeof import("./panel");
let panel: Promise<Panel> | null = null;
const load = () => (panel ??= import("./panel"));

let phase: Phase = "idle";
let open = false;

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function bootChat(): void {
  const root = document.querySelector<HTMLElement>("[data-chat-root]");
  const launcher = root?.querySelector<HTMLButtonElement>("[data-chat-launcher]");
  if (!root || !launcher || window.portfoChat) return;

  const api: PortfoChatApi = {
    async open(opener) {
      const p = await load();
      p.openChat(opener ?? launcher);
    },
    close() {
      void panel?.then((p) => p.closeChat());
    },
    async toggle(opener) {
      if (open) api.close();
      else await api.open(opener);
    },
    isOpen: () => open,
    phase: () => phase,
  };
  window.portfoChat = api;

  document.addEventListener("portfo-chat:state", (e) => {
    phase = e.detail.phase;
    open = e.detail.open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) launcher.classList.remove("is-tucked");
    else place();
  });

  launcher.addEventListener("click", () => void api.toggle(launcher));
  // Warm the panel code as soon as the visitor shows intent.
  for (const ev of ["pointerenter", "touchstart", "focus"] as const)
    launcher.addEventListener(ev, () => void load(), { once: true, passive: true });

  document.addEventListener("click", (e) => {
    const t = (e.target as Element | null)?.closest<HTMLElement>("[data-chat-open]");
    if (!t) return;
    e.preventDefault();
    // From the mobile menu: close it, and return focus to its toggle (the item is hidden).
    const menu = t.closest("details");
    menu?.removeAttribute("open");
    void api.open(menu?.querySelector<HTMLElement>("summary") ?? t);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || open || isTyping(e.target)) return;
    e.preventDefault();
    void api.open(launcher);
  });

  initTuck(root, launcher);
  loadMascot(root, launcher);
}

/** The ink-dot mascot replaces the placeholder once the page has loaded and gone idle. */
function loadMascot(root: HTMLElement, launcher: HTMLButtonElement): void {
  const go = () =>
    void import("../mascot/engine")
      .then((m) => m.initMascot(root, launcher))
      .catch(() => {
        /* the placeholder launcher keeps working */
      });
  const idle = () =>
    "requestIdleCallback" in window
      ? requestIdleCallback(go, { timeout: 2500 })
      : setTimeout(go, 600);
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
}

/* ---------- keep the launcher off text and tap targets ---------- */

let place: () => void = () => {};

function initTuck(root: HTMLElement, launcher: HTMLButtonElement): void {
  const slot = root.querySelector<HTMLElement>("[data-chat-slot]");
  if (!slot) return;
  let idle = 0;
  let raf = 0;

  const tuck = (on: boolean) => {
    // A mascot the visitor dragged ("float") keeps the spot they chose; the docked one yields.
    if (open || launcher.dataset.mascot === "float") on = false;
    if (on && launcher === document.activeElement) on = false;
    launcher.classList.toggle("is-tucked", on);
  };
  /** At rest: show only where it covers nothing readable. */
  place = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => tuck(coversContent(slot.getBoundingClientRect(), root)));
  };

  const settle = () => {
    place();
    // Once more after scroll-linked reveals have moved content into place.
    clearTimeout(again);
    again = window.setTimeout(place, 900);
  };
  let again = 0;

  addEventListener(
    "scroll",
    () => {
      clearTimeout(idle);
      clearTimeout(again);
      idle = window.setTimeout(settle, 180);
    },
    { passive: true },
  );
  addEventListener("resize", () => {
    clearTimeout(idle);
    idle = window.setTimeout(place, 180);
  });
  launcher.addEventListener("blur", () => setTimeout(place, 0));
  // A FlowDiagram details panel or sheet opening or closing changes what the slot covers.
  for (const type of ["flow:select", "flow:close"]) document.addEventListener(type, settle);
  // After the hero intro and fonts settle.
  setTimeout(place, 400);
  setTimeout(place, 2600);
  void document.fonts?.ready.then(place);
  addEventListener("load", place);
}
