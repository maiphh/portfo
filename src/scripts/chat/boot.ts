/**
 * Always-loaded part of the chat window (small): the launcher, `data-chat-open` triggers, the
 * `/` shortcut, `window.portfoChat`, and the launcher's tuck-away logic. The panel code
 * (./panel) loads on first use, or when the browser is idle after the visitor shows intent.
 */
import type { PortfoChatApi } from "~/lib/chat/events";
import type { Phase } from "~/lib/chat/state";
import { overlaps, type Box } from "~/lib/chat/geometry";

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
}

/* ---------- keep the launcher off text and tap targets ---------- */

const INTERACTIVE = "a[href],button,input,select,textarea,summary,[role=button]";

/**
 * True when real content (a line of text or a tap target) sits under the launcher's spot.
 * Text that is invisible right now still counts: scroll reveals fade it in a moment later.
 * Runs only when scrolling settles, so a full pass over the page's text is affordable.
 */
function coversContent(spot: Box, root: HTMLElement): boolean {
  const pad = 6;
  const near = (r: DOMRect) => r.width > 0 && r.height > 0 && overlaps(r, spot, pad);
  for (const el of document.querySelectorAll(INTERACTIVE))
    if (!root.contains(el) && near(el.getBoundingClientRect())) return true;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.textContent?.trim() && !root.contains(n)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const range = document.createRange();
  let lastParent: Element | null = null;
  let parentNear = false;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const parent = n.parentElement;
    if (!parent) continue;
    if (parent !== lastParent) {
      lastParent = parent;
      // Cheap reject: the parent's box (inline or block) doesn't reach the spot.
      const b = parent.getBoundingClientRect();
      parentNear =
        b.bottom >= spot.top - pad && b.top <= spot.bottom + pad && b.right >= spot.left - pad;
    }
    if (!parentNear) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (near(r)) return true;
  }
  return false;
}

let place: () => void = () => {};

function initTuck(root: HTMLElement, launcher: HTMLButtonElement): void {
  const slot = root.querySelector<HTMLElement>("[data-chat-slot]");
  if (!slot) return;
  let lastY = scrollY;
  let idle = 0;
  let raf = 0;

  const tuck = (on: boolean) => {
    if (open) on = false;
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
      const y = scrollY;
      const dy = y - lastY;
      lastY = y;
      // Out of the way while scrolling down; back on a scroll up (a sign of looking around).
      if (dy > 2) tuck(true);
      else if (dy < -2) tuck(false);
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
  // After the hero intro and fonts settle.
  setTimeout(place, 400);
  setTimeout(place, 2600);
  void document.fonts?.ready.then(place);
  addEventListener("load", place);
}
