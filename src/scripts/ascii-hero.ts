/**
 * ASCII portrait: paints the pre-computed character grid on a canvas.
 * At rest a slow luminance wave + scan passes through; under the pointer,
 * nearby characters brighten to lime, scramble and lift away from the cursor.
 * The <pre> underneath is the complete no-JS / reduced-motion version.
 */
import { asciiPortrait, ASCII_COLS, ASCII_ROWS } from "~/data/ascii-portrait";
import { gsap } from "gsap";
import { $, $$ } from "./dom";

const RAMP = " .:-=+*#%@";
const RADIUS = 9; // pointer reach, in grid cells
const FRAME_MS = 1000 / 30;

type Cell = { x: number; y: number; level: number; ch: string; phase: number; onset: number };

export function initAsciiHero() {
  const hero = $<HTMLElement>("[data-hero]");
  const frame = $<HTMLElement>("[data-ascii-frame]");
  const canvas = $<HTMLCanvasElement>("[data-ascii-canvas]");
  if (!hero || !frame || !canvas) return;

  const copy = $$("[data-h]", hero);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    frame.classList.add("is-static");
    gsap.set(copy, { visibility: "visible" });
    window.__hero = 1;
    return;
  }

  const rows = asciiPortrait.split("\n");
  const cells: Cell[] = [];
  for (let y = 0; y < ASCII_ROWS; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < ASCII_COLS; x++) {
      const ch = row[x] ?? " ";
      if (ch === " ") continue;
      // Resolve adjacent character blocks together, with a slight diagonal sweep.
      const grain = Math.sin(Math.floor(x / 3) * 17 + Math.floor(y / 3) * 47) * 43758;
      const onset = (x / ASCII_COLS + y / ASCII_ROWS) * 0.22 + (grain - Math.floor(grain)) * 0.32;
      cells.push({ x, y, level: RAMP.indexOf(ch), ch, phase: x * 0.27 + y * 0.19, onset });
    }
  }

  let w = 0;
  let h = 0;
  let cw = 1;
  let chh = 1;
  const resize = () => {
    const r = frame.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    w = r.width;
    h = r.height;
    cw = w / ASCII_COLS;
    chh = h / ASCII_ROWS;
    ctx.font = `700 ${Math.max(7, chh * 1.08)}px "JetBrains Mono Variable", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  };
  resize();

  const pointer = { x: -9999, y: -9999, sx: -9999, sy: -9999, active: false };
  const onMove = (e: PointerEvent) => {
    const r = frame.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    if (!pointer.active) {
      pointer.sx = pointer.x;
      pointer.sy = pointer.y;
    }
    pointer.active = true;
  };
  const onLeave = () => {
    pointer.active = false;
  };
  frame.addEventListener("pointermove", onMove);
  frame.addEventListener("pointerleave", onLeave);

  let raf = 0;
  let start = 0;
  let last = 0;

  let rendered = false;
  let entrance: gsap.core.Tween | undefined;
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    if (now - last < FRAME_MS) return;
    last = now;
    if (!start) start = now;

    const elapsed = now - start;
    const reveal = rendered ? 1 : Math.min(1, elapsed / 1100);
    const t = elapsed * 0.001;
    pointer.sx += (pointer.x - pointer.sx) * 0.2;
    pointer.sy += (pointer.y - pointer.sy) * 0.2;
    const gx = pointer.sx / cw;
    const gy = pointer.sy / chh;
    const scanY = (t * 0.13) % 1;

    ctx.clearRect(0, 0, w, h);
    let fill = "";
    for (const c of cells) {
      const focus = rendered ? 1 : Math.min(1, (reveal - c.onset) / 0.24);
      if (focus <= 0) continue;

      const wave = Math.sin(c.phase - t * 1.7);
      const scan = Math.exp(-Math.pow((scanY - c.y / ASCII_ROWS) * 9, 2));
      let dx = wave * 0.6;
      let dy = Math.sin(c.phase * 0.7 + t) * 0.35;
      let boost = 0;
      let ch = focus < 0.5 ? "·" : c.ch;

      if (pointer.active) {
        const ax = c.x - gx;
        const ay = (c.y - gy) * 1.45; // grid cells are taller than they are wide
        const d = Math.hypot(ax, ay);
        if (d < RADIUS) {
          const e = 1 - d / RADIUS;
          boost = e;
          dx += (ax / (d || 1)) * e * 2.6;
          dy += (ay / (d || 1)) * e * 1.8;
          if (Math.random() < e * 0.5)
            ch = RAMP[Math.min(RAMP.length - 1, c.level + 2 + ((Math.random() * 2) | 0))] ?? ch;
        }
      }

      const level = Math.max(
        1,
        Math.min(RAMP.length - 1, Math.round(c.level + 2 + wave * 0.9 + scan * 2 + boost * 4)),
      );
      const alpha = Math.min(1, 0.45 + (level / (RAMP.length - 1)) * 0.55 + boost * 0.2) * focus;
      const color = boost > 0.08 ? "#d4f56b" : "#f1f1ec";
      if (color !== fill) {
        ctx.fillStyle = color;
        fill = color;
      }
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillText(ch, c.x * cw + cw / 2 + dx, c.y * chh + chh / 2 + dy);
    }
    ctx.globalAlpha = 1;
    if (!rendered && reveal === 1) {
      rendered = true;
      entrance = gsap.fromTo(
        copy,
        { autoAlpha: 0, y: 8, filter: "blur(8px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.65,
          stagger: 0.09,
          ease: "power3.out",
          clearProps: "transform,filter",
        },
      );
    }
  };

  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  let inView = true;
  function sync() {
    cancelAnimationFrame(raf);
    if (mq.matches) {
      rendered = true;
      entrance?.progress(1);
      frame!.classList.remove("is-ready");
      gsap.set(copy, { visibility: "visible" });
    } else if (inView) {
      frame!.classList.add("is-ready");
      raf = requestAnimationFrame(draw);
    }
  }

  sync();
  window.__hero = 1;
  mq.addEventListener("change", sync);
  new IntersectionObserver(([entry]) => {
    inView = !!entry?.isIntersecting;
    sync();
  }).observe(hero);
  new ResizeObserver(resize).observe(frame);
}
