/**
 * The ink-dot mascot (PR 3), loaded lazily by the chat boot once the page is idle.
 *
 * - ≥1280px with motion allowed: it roams the side margins only (lanes outside the content
 *   column), perches next to headings, never rests on content, and changes sides through the
 *   viewport edges instead of crossing the column.
 * - Below 1280px, or with no margin wide enough, or with reduced motion: it is the docked
 *   launcher, keeping the chat boot's anti-overlap tuck.
 * - Reduced motion: one static frame per state change, no loop, no roaming.
 * - One rAF loop, stopped while the tab is hidden, the docked launcher is tucked off-screen,
 *   or nothing needs drawing.
 * - Moods follow the chat's portfo-chat:state / :status events (see lib/mascot/state).
 */
import type { Phase } from "~/lib/chat/state";
import { createInk, INK_PAD, type Ink } from "~/lib/mascot/ink";
import {
  boxAt,
  inMargins,
  lanes,
  perches,
  pick,
  roamSize,
  route,
  yBounds,
  type Lane,
} from "~/lib/mascot/roam";
import { gazeVector, mascotView, onPhase, type MascotView } from "~/lib/mascot/state";
import { contentRects, coversContent } from "~/scripts/chat/content";

const DESK = window.matchMedia("(min-width: 1280px)");
const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)");
const FINE = window.matchMedia("(hover: hover) and (pointer: fine)");
const DOCK_SIZE = 56;
const AVATAR = 40;
const DEFAULT_TIP = "Ask Phu's assistant";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut3 = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

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
  mode(): "roam" | "docked";
  view(): MascotView;
  pos(): { x: number; y: number; size: number };
  lanes(): Lane[];
  moving(): boolean;
  roam(): void;
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
  let main = surface(canvas, DOCK_SIZE);

  let trail: {
    c: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    dots: TrailDot[];
    acc: number;
  } | null = null;

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
  let roaming = false;
  let open = false;
  let phase: Phase = "idle";
  let tool: string | null = null;
  let label = "";
  let hovering = false;
  let focused = false;
  let happyUntil = 0;
  let errorUntil = 0;
  let frames = 0;
  let lns: Lane[] = [];

  // Travel: a queue of waypoints, one eased segment at a time.
  let path: { x: number; y: number; jump?: boolean }[] = [];
  let seg: { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number } | null =
    null;
  let pausedAt = 0;
  let perchTimer = 0;
  let scrollTimer = 0;
  let view: MascotView = currentView(performance.now());

  function currentView(now: number): MascotView {
    return mascotView({
      phase,
      tool,
      open,
      hovering,
      focused,
      moving: !!seg,
      now,
      happyUntil,
      errorUntil,
    });
  }

  const reduced = () => REDUCE.matches;

  // While roaming, the launcher keeps the top-left it had when docked and moves by transform only,
  // so entering the roaming layer is not a layout shift (CLS).
  const base = { x: 0, y: 0 };
  function apply(): void {
    const dx = Math.round(S.x - base.x);
    const dy = Math.round(S.y - base.y);
    launcher.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    launcher.classList.toggle("is-right", S.x > document.documentElement.clientWidth / 2);
  }

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
    return !(!roaming && tucked());
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
    step(now);
    const ivx = (S.x - S.px) / dt;
    const ivy = (S.y - S.py) / dt;
    S.vx = lerp(S.vx, Math.abs(ivx) > 4000 ? 0 : ivx, 0.3);
    S.vy = lerp(S.vy, Math.abs(ivy) > 4000 ? 0 : ivy, 0.3);
    S.px = S.x;
    S.py = S.y;
    S.speed = roaming ? Math.hypot(S.vx, S.vy) : 0;
    // Eyes follow a nearby pointer, else the direction of travel.
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
    drawTrail(dt);
    if (!want()) {
      stop();
      renderStatic();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  /* ---------- trail (roaming only) ---------- */
  interface TrailDot {
    x: number;
    y: number;
    life: number;
    r: number;
  }
  function makeTrail(): void {
    if (trail) return;
    const c = document.createElement("canvas");
    c.className = "mascot-trail";
    c.setAttribute("aria-hidden", "true");
    root.prepend(c);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    trail = { c, ctx, dots: [], acc: 0 };
    fitTrail();
  }
  function fitTrail(): void {
    if (!trail) return;
    trail.c.width = window.innerWidth;
    trail.c.height = window.innerHeight;
  }
  function dropTrail(): void {
    trail?.c.remove();
    trail = null;
  }
  function drawTrail(dt: number): void {
    const T = trail;
    if (!T) return;
    if (S.speed > 40 && !open) {
      T.acc += dt;
      if (T.acc > 0.045) {
        T.acc = 0;
        T.dots.push({
          x: S.x + S.size / 2 + (Math.random() - 0.5) * 10,
          y: S.y + S.size / 2 + (Math.random() - 0.5) * 10,
          life: 1,
          r: 1.6 + Math.random() * 1.6,
        });
        if (T.dots.length > 40) T.dots.shift();
      }
    }
    if (!T.dots.length) return;
    T.ctx.clearRect(0, 0, T.c.width, T.c.height);
    T.dots = T.dots.filter((p) => (p.life -= dt / 1.3) > 0);
    T.ctx.fillStyle = "#d4f56b";
    for (const p of T.dots) {
      T.ctx.globalAlpha = p.life * 0.45;
      T.ctx.beginPath();
      T.ctx.arc(p.x, p.y, p.r * (0.5 + p.life * 0.5), 0, Math.PI * 2);
      T.ctx.fill();
    }
    T.ctx.globalAlpha = 1;
    if (!T.dots.length) T.ctx.clearRect(0, 0, T.c.width, T.c.height);
  }

  /* ---------- geometry ---------- */
  function contentEdges(): { left: number; right: number } {
    const w = document.querySelector<HTMLElement>("main .wrap");
    const vw = document.documentElement.clientWidth;
    if (!w) return { left: 0, right: vw };
    const r = w.getBoundingClientRect();
    const cs = getComputedStyle(w);
    return {
      left: r.left + parseFloat(cs.paddingLeft),
      right: r.right - parseFloat(cs.paddingRight),
    };
  }
  function navBottom(): number {
    return document.querySelector(".nav")?.getBoundingClientRect().bottom ?? 0;
  }
  function measure(): { size: number; lanes: Lane[] } | null {
    if (!DESK.matches || reduced()) return null;
    const edges = contentEdges();
    const vw = document.documentElement.clientWidth;
    const size = roamSize(edges, vw);
    if (!size) return null;
    const ls = lanes(edges, vw, size);
    return ls.length ? { size, lanes: ls } : null;
  }

  /* ---------- roaming ---------- */
  function schedule(ms = 2400 + Math.random() * 2600): void {
    clearTimeout(perchTimer);
    perchTimer = window.setTimeout(() => roam(false), ms);
  }
  function cursorNear(): boolean {
    const cx = S.x + S.size / 2;
    const cy = S.y + S.size / 2;
    return P.x >= 0 && performance.now() - P.t < 2500 && Math.hypot(P.x - cx, P.y - cy) < 170;
  }
  function roam(force: boolean): void {
    if (!roaming || open || hovering || focused || reduced()) return;
    if (!force && cursorNear()) return schedule(1600);
    const vw = document.documentElement.clientWidth;
    const side = S.x + S.size / 2 < vw / 2 ? "L" : "R";
    const cur = lns.find((l) => l.side === side) ?? lns[0];
    if (!cur) return;
    const other = lns.find((l) => l !== cur);
    const next = other && Math.random() < 0.28 ? other : cur;
    const { top, bottom } = yBounds(navBottom(), window.innerHeight, S.size);
    const ys: { y: number; weight: number }[] = [];
    for (const h of document.querySelectorAll("main h1, main h2, main h3, footer .foot-name")) {
      const r = h.getBoundingClientRect();
      if (r.bottom < top || r.top > bottom) continue;
      ys.push({
        y: clamp(r.top + Math.min(r.height, 56) / 2 - S.size / 2, top, bottom),
        weight: 3,
      });
    }
    for (let i = 0; i < 5; i++) ys.push({ y: top + Math.random() * (bottom - top), weight: 1 });
    if (P.x >= 0 && performance.now() - P.t < 2500 && Math.abs(P.x - (next.x0 + next.x1) / 2) < 120)
      ys.push({
        y: clamp(P.y + (P.y > window.innerHeight / 2 ? -S.size - 70 : 70), top, bottom),
        weight: 4,
      });
    const region = {
      left: next.x0 - 12,
      right: next.x1 + S.size + 12,
      top: 0,
      bottom: window.innerHeight,
    };
    const obstacles = contentRects(region, root);
    const c = perches(next, ys, S.size, obstacles, { x: S.x, y: S.y });
    const p = pick(c);
    if (!p) return schedule(1800);
    path = route({ x: S.x, y: S.y }, p, vw, S.size);
    nextSeg(performance.now());
    start();
  }
  function nextSeg(now: number): void {
    for (;;) {
      const p = path.shift();
      if (!p) {
        seg = null;
        schedule();
        refresh();
        return;
      }
      if (p.jump) {
        S.x = S.px = p.x;
        S.y = S.py = p.y;
        apply();
        continue;
      }
      const dist = Math.hypot(p.x - S.x, p.y - S.y);
      seg = {
        x0: S.x,
        y0: S.y,
        x1: p.x,
        y1: p.y,
        t0: now,
        dur: clamp(dist / 320, 0.6, 2.4) * 1100,
      };
      return;
    }
  }
  function step(now: number): void {
    if (!seg || pausedAt) return;
    const p = clamp((now - seg.t0) / seg.dur, 0, 1);
    const e = easeInOut3(p);
    S.x = lerp(seg.x0, seg.x1, e);
    S.y = lerp(seg.y0, seg.y1, e);
    apply();
    if (p >= 1) nextSeg(now);
  }
  function pause(): void {
    if (seg && !pausedAt) pausedAt = performance.now();
    clearTimeout(perchTimer);
  }
  function resume(): void {
    if (pausedAt && seg) seg.t0 += performance.now() - pausedAt;
    pausedAt = 0;
    if (!seg && roaming) schedule(1800);
  }
  function stopTravel(): void {
    seg = null;
    path = [];
    pausedAt = 0;
    clearTimeout(perchTimer);
  }

  /* ---------- modes ---------- */
  // Going back to the docked corner (a resize below 1280px) changes the launcher's box. Hide it
  // for two frames so the change is an appear, not a layout shift.
  let swapRaf = 0;
  function hideForSwap(): void {
    // Never hide a focused launcher: visibility:hidden would drop keyboard focus.
    if (launcher.matches(":focus")) return;
    launcher.classList.add("is-swapping");
    cancelAnimationFrame(swapRaf);
    swapRaf = requestAnimationFrame(() => {
      swapRaf = requestAnimationFrame(() => launcher.classList.remove("is-swapping"));
    });
  }
  function setMode(): void {
    const m = measure();
    if (!m) {
      if (roaming || launcher.dataset.mascot !== "docked") {
        if (roaming) hideForSwap();
        roaming = false;
        stopTravel();
        dropTrail();
        launcher.classList.remove("is-roaming", "is-right");
        launcher.style.transform = launcher.style.width = launcher.style.height = "";
        launcher.style.left = launcher.style.top = "";
        launcher.dataset.mascot = "docked";
      }
      S.size = DOCK_SIZE;
      if (main?.size !== DOCK_SIZE) main = surface(canvas, DOCK_SIZE, main ?? undefined);
      lns = [];
      // Let the chat boot re-check the docked spot.
      window.dispatchEvent(new Event("resize"));
      refresh();
      return;
    }
    lns = m.lanes;
    const was = roaming;
    if (!was) {
      // offsetLeft/Top: the docked layout box, ignoring the tuck transform.
      base.x = launcher.offsetLeft;
      base.y = launcher.offsetTop;
      launcher.style.left = `${base.x}px`;
      launcher.style.top = `${base.y}px`;
    }
    roaming = true;
    launcher.dataset.mascot = "roam";
    launcher.classList.remove("is-tucked");
    launcher.classList.add("is-roaming");
    if (S.size !== m.size || !main || main.size !== m.size) {
      S.size = m.size;
      main = surface(canvas, m.size, main ?? undefined);
    }
    launcher.style.width = launcher.style.height = `${m.size}px`;
    makeTrail();
    fitTrail();
    if (!was) {
      // Walk in from the left edge.
      S.x = S.px = -m.size - 40;
      S.y = S.py = yBounds(navBottom(), window.innerHeight, m.size).bottom;
      apply();
      stopTravel();
      window.setTimeout(() => roam(true), 600);
    } else if (!seg && !inMargins(S.x, S.size, lns, document.documentElement.clientWidth)) {
      stopTravel();
      roam(true);
    }
    refresh();
  }

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
    if (d.open && !open) {
      launcher.classList.remove("has-unread");
      pause();
    }
    if (!d.open && open) {
      happyUntil = Math.max(happyUntil, now + 1200);
      window.setTimeout(refresh, 1230);
      resume();
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
    pause();
    refresh();
  });
  launcher.addEventListener("pointerleave", () => {
    if (!hovering) return;
    hovering = false;
    resume();
    refresh();
  });
  launcher.addEventListener("focus", () => {
    focused = true;
    pause();
    refresh();
  });
  launcher.addEventListener("blur", () => {
    focused = false;
    resume();
    refresh();
  });
  addEventListener(
    "scroll",
    () => {
      if (!roaming || open) return;
      clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        if (seg || hovering || focused) return;
        // Content scrolled under the perch (full-bleed blocks): move off it now.
        if (coversContent(boxAt(S.x, S.y, S.size), root, 6)) roam(true);
      }, 450);
    },
    { passive: true },
  );
  let rz = 0;
  addEventListener("resize", (e) => {
    if (!e.isTrusted) return;
    clearTimeout(rz);
    rz = window.setTimeout(() => {
      fitTrail();
      setMode();
    }, 150);
  });
  for (const m of [DESK, REDUCE]) m.addEventListener("change", () => setMode());

  /* ---------- boot ---------- */
  setMode();
  renderStatic();

  const debug: MascotDebug = {
    running: () => running,
    frames: () => frames,
    mode: () => (roaming ? "roam" : "docked"),
    view: () => view,
    pos: () => ({ x: S.x, y: S.y, size: S.size }),
    lanes: () => lns,
    moving: () => !!seg,
    roam: () => roam(true),
  };
  (window as Window & { __portfoMascot?: MascotDebug }).__portfoMascot = debug;
}
