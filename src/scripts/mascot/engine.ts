/**
 * The ink-dot mascot (PR 3), loaded lazily by the chat boot once the page is idle.
 *
 * - It defaults to the docked launcher: fixed at the bottom-right of the window (chat.css).
 * - The visitor can drag it; on release it snaps to the nearest of the four corners with a
 *   short overshoot → come-back → zigzag settle. The chosen corner is stored in sessionStorage
 *   and restored on the next page. The release click is suppressed so a drag doesn't open the chat.
 * - Reduced motion: one static frame per state change, no loop. Drop snaps instantly.
 * - One rAF loop, stopped while the tab is hidden, the docked launcher is tucked off-screen,
 *   or nothing needs drawing.
 * - An open FlowDiagram panel or sheet (data-mascot-avoid) counts as content: a floated mascot
 *   whose corner the panel now covers rests at the nearest free corner until it closes. The
 *   stored corner is not changed.
 * - Moods follow the chat's portfo-chat:state / :status events (see lib/mascot/state).
 */
import type { Phase } from "~/lib/chat/state";
import { cornerSpots, nearestCorner, type CornerId, type Spot } from "~/lib/mascot/corners";
import { createInk, INK_PAD, type Ink } from "~/lib/mascot/ink";
import { loadCorner, saveCorner } from "~/lib/mascot/persist";
import { hitsPanel } from "../chat/content";
import { gazeVector, mascotView, onPhase, type MascotView } from "~/lib/mascot/state";

const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)");
const FINE = window.matchMedia("(hover: hover) and (pointer: fine)");
const DOCK_SIZE = 56;
const AVATAR = 40;
const DEFAULT_TIP = "Ask Phu's assistant";
/** Movement before a press counts as a drag rather than a click. */
const DRAG_MIN = 6;
/** The dragged box stays this far inside the viewport while moving. */
const EDGE = 8;
/** How far past the corner the snap shoots before coming back. */
const OVERSHOOT = 36;
/** Lateral zig amplitude while settling. */
const ZIG = 16;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  css: number;
  size: number;
  ink: Ink;
}

function surface(canvas: HTMLCanvasElement, size: number, prev?: Surface): Surface | null {
  const css = Math.round(size * INK_PAD);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
  canvas.style.width = canvas.style.height = `${css}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx, css, size, ink: prev?.ink ?? createInk() };
}

export interface MascotDebug {
  running(): boolean;
  frames(): number;
  mode(): "docked" | "float";
  view(): MascotView;
  pos(): { x: number; y: number; size: number };
  moving(): boolean;
}

export function initMascot(root: HTMLElement, launcher: HTMLButtonElement): void {
  if (launcher.dataset.mascot) return;
  const dialog = root.querySelector<HTMLElement>("[data-chat]");
  const avatarBox = root.querySelector<HTMLElement>(".chat-avatar");

  /* ---------- DOM ---------- */
  const canvas = document.createElement("canvas");
  canvas.className = "mascot-ink";
  canvas.setAttribute("aria-hidden", "true");
  launcher.append(canvas);
  const tip = document.createElement("span");
  tip.className = "mascot-tip";
  tip.setAttribute("aria-hidden", "true");
  tip.textContent = DEFAULT_TIP;
  const badge = document.createElement("span");
  badge.className = "mascot-badge";
  badge.setAttribute("aria-hidden", "true");
  launcher.append(tip, badge);
  launcher.classList.add("has-mascot");
  launcher.dataset.mascot = "docked";

  let avatar: Surface | null = null;
  if (avatarBox) {
    const c = document.createElement("canvas");
    c.setAttribute("aria-hidden", "true");
    avatarBox.replaceChildren(c);
    avatarBox.classList.add("has-ink");
    avatar = surface(c, AVATAR / INK_PAD);
  }
  const main = surface(canvas, DOCK_SIZE);

  /* ---------- state ---------- */
  const S = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    look: { x: 0, y: 0 },
    size: DOCK_SIZE,
  };
  const P = { x: -1, y: -1, t: 0 };
  let open = false;
  let phase: Phase = "idle";
  let tool: string | null = null;
  let label = "";
  let hovering = false;
  let focused = false;
  /** True while the visitor is actively moving the mascot. */
  let moving = false;
  /** True while the post-drop corner snap animation is running. */
  let snapping = false;
  let happyUntil = 0;
  let errorUntil = 0;
  let frames = 0;

  let view: MascotView = currentView(performance.now());

  function currentView(now: number): MascotView {
    return mascotView({
      phase,
      tool,
      open,
      hovering,
      focused,
      moving,
      now,
      happyUntil,
      errorUntil,
    });
  }

  const reduced = () => REDUCE.matches;

  function syncAttrs(): void {
    if (launcher.dataset.mood !== view.mood) launcher.dataset.mood = view.mood;
    const t = view.tool ?? "";
    if ((launcher.dataset.tool ?? "") !== t) {
      if (t) launcher.dataset.tool = t;
      else delete launcher.dataset.tool;
    }
    const want = view.mood === "think" && label ? label : DEFAULT_TIP;
    if (tip.textContent !== want) tip.textContent = want;
    launcher.classList.toggle("is-busy", view.mood === "think" || view.mood === "talk");
  }

  /* ---------- drawing ---------- */
  let raf = 0;
  let running = false;
  let last = 0;

  const tucked = () => launcher.classList.contains("is-tucked");
  function want(): boolean {
    if (document.hidden || reduced()) return false;
    if (open) return !!avatar && !!dialog && !dialog.hidden;
    return !(!floating() && tucked());
  }
  function start(): void {
    if (running || !want()) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stop(): void {
    running = false;
    cancelAnimationFrame(raf);
  }
  function refresh(): void {
    view = currentView(performance.now());
    syncAttrs();
    if (want()) start();
    else {
      stop();
      renderStatic();
    }
  }

  function stFor(sf: Surface, isAvatar: boolean, t: number) {
    const g = gazeVector(view.pose.gaze, t);
    return {
      mood: view.mood,
      size: sf.size,
      vx: isAvatar ? 0 : S.vx,
      vy: isAvatar ? 0 : S.vy,
      speed: isAvatar ? 0 : S.speed,
      look: g ?? (isAvatar ? { x: 0.2, y: 0.5 } : S.look),
      ripple: view.pose.ripple,
      reduced: reduced(),
    };
  }

  function renderStatic(): void {
    for (const [sf, isAvatar] of [
      [main, false],
      [avatar, true],
    ] as const)
      if (sf)
        sf.ink.render(sf.ctx, sf.css, sf.css, { ...stFor(sf, isAvatar, 0), reduced: true }, 0, 0);
  }

  function tick(now: number): void {
    if (!running) return;
    frames++;
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;
    const ivx = (S.x - S.px) / dt;
    const ivy = (S.y - S.py) / dt;
    S.vx = lerp(S.vx, Math.abs(ivx) > 4000 ? 0 : ivx, 0.3);
    S.vy = lerp(S.vy, Math.abs(ivy) > 4000 ? 0 : ivy, 0.3);
    S.px = S.x;
    S.py = S.y;
    S.speed = dragging() || snapping ? Math.hypot(S.vx, S.vy) : 0;
    // Eyes follow a nearby pointer, else the direction of travel while dragging.
    const r = launcher.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = P.x - cx;
    const dy = P.y - cy;
    const dist = Math.hypot(dx, dy);
    const tl =
      P.x >= 0 && dist < 460 && now - P.t < 4000
        ? { x: dx / Math.max(dist, 1), y: dy / Math.max(dist, 1) }
        : { x: S.vx / 900, y: S.vy / 900 };
    S.look.x = lerp(S.look.x, clamp(tl.x, -1, 1), 0.12);
    S.look.y = lerp(S.look.y, clamp(tl.y, -1, 1), 0.12);
    view = currentView(now);
    syncAttrs();
    const sf = open ? avatar : main;
    if (sf) sf.ink.render(sf.ctx, sf.css, sf.css, stFor(sf, open, now / 1000), dt, now / 1000);
    if (!want()) {
      stop();
      renderStatic();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  /* ---------- dragging → corner snap ---------- */
  // The docked launcher sits where chat.css puts it (bottom right). A drag moves it by fixed
  // left/top; on release it snaps to the nearest of the four corners. The press-and-move
  // threshold keeps plain clicks working.
  let drag: {
    pointerId: number;
    moved: boolean;
    x0: number;
    y0: number;
    grabX: number;
    grabY: number;
  } | null = null;
  let suppressClick = false;
  const spot = { x: 0, y: 0 }; // float position: the box's viewport left/top
  let corner: CornerId | null = null;
  let snapRaf = 0;

  const floating = () => launcher.dataset.mascot === "float";
  const dragging = () => !!drag;

  /** Match the docked launcher's CSS edge (--chat-edge / --chat-bottom) via the slot. */
  function pads(): { left: number; right: number; top: number; bottom: number } {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const slot = root.querySelector<HTMLElement>("[data-chat-slot]");
    const sr = slot?.getBoundingClientRect();
    if (sr && sr.width > 0) {
      const right = Math.max(0, vw - sr.right);
      const bottom = Math.max(0, vh - sr.bottom);
      const side = right || 16;
      return { left: side, right: side, top: side, bottom: bottom || side };
    }
    const edge =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chat-edge")) || 16;
    return { left: edge, right: edge, top: edge, bottom: edge };
  }

  function spotsFor(w: number, h: number): Record<CornerId, Spot> {
    return cornerSpots(document.documentElement.clientWidth, window.innerHeight, w, h, pads());
  }

  function applySpot(): void {
    if (!floating()) return;
    const r = launcher.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    launcher.style.left = `${Math.round(spot.x)}px`;
    launcher.style.top = `${Math.round(spot.y)}px`;
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
    launcher.classList.toggle("is-right", spot.x + r.width / 2 > vw / 2);
  }

  function place(): void {
    if (!floating()) return;
    const r = launcher.getBoundingClientRect();
    const w = r.width || DOCK_SIZE;
    const h = r.height || DOCK_SIZE;
    if (corner) {
      const s = restSpot(spotsFor(w, h), corner, w, h);
      spot.x = s.x;
      spot.y = s.y;
    } else {
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      spot.x = clamp(spot.x, EDGE, Math.max(EDGE, vw - w - EDGE));
      spot.y = clamp(spot.y, EDGE, Math.max(EDGE, vh - h - EDGE));
    }
    applySpot();
  }

  /** The chosen corner, or the nearest one an open panel leaves free. */
  function restSpot(all: Record<CornerId, Spot>, id: CornerId, w: number, h: number): Spot {
    const free = (c: Spot) => !hitsPanel({ left: c.x, top: c.y, right: c.x + w, bottom: c.y + h });
    if (free(all[id])) return all[id];
    const want = all[id];
    const others = (["tl", "tr", "bl", "br"] as const)
      .filter((c) => c !== id)
      .sort(
        (a, b) =>
          Math.hypot(all[a].x - want.x, all[a].y - want.y) -
          Math.hypot(all[b].x - want.x, all[b].y - want.y),
      );
    const alt = others.find((c) => free(all[c]));
    return alt ? all[alt] : want;
  }

  function goFloat(): void {
    launcher.dataset.mascot = "float";
    launcher.classList.remove("is-tucked");
    launcher.classList.add("is-float");
    // Seed the float spot from the box where it currently sits, tuck transform cleared.
    const r = launcher.getBoundingClientRect();
    spot.x = r.left;
    spot.y = r.top;
    place();
  }

  /** Restore a previously chosen corner (no snap animation — already settled last page). */
  function restoreFloat(id: CornerId): void {
    corner = id;
    launcher.dataset.mascot = "float";
    launcher.classList.remove("is-tucked");
    launcher.classList.add("is-float");
    place();
  }

  function cancelSnap(): void {
    if (!snapRaf) return;
    cancelAnimationFrame(snapRaf);
    snapRaf = 0;
    snapping = false;
  }

  const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
  const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  /** Shoot past the corner, come back, then zigzag into place. */
  function snapToNearest(): void {
    cancelSnap();
    const r = launcher.getBoundingClientRect();
    const w = r.width || DOCK_SIZE;
    const h = r.height || DOCK_SIZE;
    const all = spotsFor(w, h);
    corner = nearestCorner(spot.x, spot.y, all);
    saveCorner(corner);
    const target = all[corner];
    const from = { x: spot.x, y: spot.y };

    if (reduced()) {
      spot.x = target.x;
      spot.y = target.y;
      S.x = S.px = spot.x;
      S.y = S.py = spot.y;
      applySpot();
      moving = false;
      refresh();
      return;
    }

    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const over = {
      x: target.x + ux * OVERSHOOT,
      y: target.y + uy * OVERSHOOT,
    };
    // Segments: shoot → come back (past center of zig) → zig → zag → settle.
    const segs: { to: Spot; ms: number; ease: (t: number) => number }[] = [
      { to: over, ms: 220, ease: easeOutCubic },
      { to: { x: target.x + px * ZIG, y: target.y + py * ZIG }, ms: 140, ease: easeInOut },
      {
        to: { x: target.x - px * ZIG * 0.7, y: target.y - py * ZIG * 0.7 },
        ms: 110,
        ease: easeInOut,
      },
      {
        to: { x: target.x + px * ZIG * 0.35, y: target.y + py * ZIG * 0.35 },
        ms: 90,
        ease: easeInOut,
      },
      { to: target, ms: 120, ease: easeOutCubic },
    ];

    snapping = true;
    moving = true;
    start();
    let seg = 0;
    let segStart = performance.now();
    let segFrom = { ...from };

    const step = (now: number) => {
      const cur = segs[seg];
      if (!cur) {
        snapRaf = 0;
        snapping = false;
        moving = false;
        spot.x = target.x;
        spot.y = target.y;
        applySpot();
        refresh();
        return;
      }
      const t = clamp((now - segStart) / cur.ms, 0, 1);
      const e = cur.ease(t);
      spot.x = lerp(segFrom.x, cur.to.x, e);
      spot.y = lerp(segFrom.y, cur.to.y, e);
      S.x = spot.x;
      S.y = spot.y;
      applySpot();
      if (t >= 1) {
        seg++;
        segStart = now;
        segFrom = { ...cur.to };
      }
      snapRaf = requestAnimationFrame(step);
    };
    snapRaf = requestAnimationFrame(step);
  }

  launcher.addEventListener("pointerdown", (e) => {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    cancelSnap();
    moving = false;
    drag = {
      pointerId: e.pointerId,
      moved: false,
      x0: e.clientX,
      y0: e.clientY,
      grabX: 0,
      grabY: 0,
    };
    const r = launcher.getBoundingClientRect();
    drag.grabX = e.clientX - r.left;
    drag.grabY = e.clientY - r.top;
    launcher.setPointerCapture(e.pointerId);
    start();
  });
  launcher.addEventListener("pointermove", (e) => {
    if (drag?.pointerId !== e.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_MIN) return;
      drag.moved = true;
      moving = true;
      corner = null; // free while dragging; snap picks a corner on release
      launcher.classList.add("is-dragging");
      if (!floating()) goFloat();
    }
    spot.x = e.clientX - drag.grabX;
    spot.y = e.clientY - drag.grabY;
    S.x = S.px = spot.x; // feed the ink's velocity for the stretch on travel
    S.y = S.py = spot.y;
    place();
  });
  const endDrag = (e: PointerEvent): void => {
    if (drag?.pointerId !== e.pointerId) return;
    const moved = drag.moved;
    drag = null;
    launcher.classList.remove("is-dragging");
    if (moved) {
      suppressClick = true; // the release click must not open the chat
      snapToNearest();
    } else {
      moving = false;
      refresh();
    }
  };
  launcher.addEventListener("pointerup", endDrag);
  launcher.addEventListener("pointercancel", endDrag);
  // Capture on the document: stops the launcher's own click listeners from seeing the release
  // click after a drag, but leaves ordinary clicks alone.
  document.addEventListener(
    "click",
    (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  /* ---------- events ---------- */
  document.addEventListener("portfo-chat:state", (e) => {
    const now = performance.now();
    const d = e.detail;
    const t = onPhase(phase, d.phase, now);
    if (t.happyUntil) happyUntil = t.happyUntil;
    if (t.errorUntil) errorUntil = t.errorUntil;
    // Static frames (reduced motion) need a nudge when a timed mood ends.
    if (t.happyUntil || t.errorUntil)
      window.setTimeout(refresh, Math.max(happyUntil, errorUntil) - now + 30);
    if (d.phase === "done" && phase === "answering" && !d.open)
      launcher.classList.add("has-unread");
    if (d.open && !open) launcher.classList.remove("has-unread");
    if (!d.open && open) {
      happyUntil = Math.max(happyUntil, now + 1200);
      window.setTimeout(refresh, 1230);
    }
    if (!(d.phase === "thinking" || d.phase === "verifying")) {
      tool = null;
      label = "";
    }
    phase = d.phase;
    open = d.open;
    launcher.classList.toggle("is-away", open);
    refresh();
  });
  document.addEventListener("portfo-chat:status", (e) => {
    tool = e.detail.tool;
    label = e.detail.label;
    refresh();
  });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : refresh()));
  new MutationObserver(() => refresh()).observe(launcher, {
    attributes: true,
    attributeFilter: ["class"],
  });

  addEventListener(
    "pointermove",
    (e) => {
      P.x = e.clientX;
      P.y = e.clientY;
      P.t = performance.now();
    },
    { passive: true },
  );
  launcher.addEventListener("pointerenter", () => {
    if (!FINE.matches) return;
    hovering = true;
    refresh();
  });
  launcher.addEventListener("pointerleave", () => {
    if (!hovering) return;
    hovering = false;
    refresh();
  });
  launcher.addEventListener("focus", () => {
    focused = true;
    refresh();
  });
  launcher.addEventListener("blur", () => {
    focused = false;
    refresh();
  });
  let rz = 0;
  addEventListener("resize", (e) => {
    if (!e.isTrusted) return;
    clearTimeout(rz);
    rz = window.setTimeout(() => {
      // Keep a floated mascot on its chosen corner (or clamp while mid-drag).
      place();
      refresh();
    }, 150);
  });
  // Re-check the rest spot when a FlowDiagram panel opens or closes, and after scrolling
  // (the panel moves with the page; the mascot is fixed).
  let rest = 0;
  const recheck = () => {
    clearTimeout(rest);
    rest = window.setTimeout(() => {
      if (!floating() || dragging() || snapping) return;
      place();
      refresh();
    }, 120);
  };
  for (const type of ["flow:select", "flow:close"]) document.addEventListener(type, recheck);
  addEventListener("scroll", recheck, { passive: true });
  REDUCE.addEventListener("change", refresh);

  /* ---------- boot ---------- */
  const saved = loadCorner();
  if (saved) restoreFloat(saved);

  refresh();
  renderStatic();

  const debug: MascotDebug = {
    running: () => running,
    frames: () => frames,
    mode: () => (floating() ? "float" : "docked"),
    view: () => view,
    pos: () => ({ x: S.x, y: S.y, size: S.size }),
    moving: () => moving,
  };
  (window as Window & { __portfoMascot?: MascotDebug }).__portfoMascot = debug;
}
