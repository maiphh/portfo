/**
 * The ink-dot mascot (design option 4): ~60 dots on a hex grid that stretch along their travel,
 * squash and jiggle when they stop (a spring), blink two eye holes, ripple while thinking and
 * droop on an error. Ported from portfo-design/mascot/src/r4-ink.js.
 */
import type { Mood } from "./state";

export interface InkState {
  mood: Mood;
  size: number;
  vx: number;
  vy: number;
  speed: number;
  look: { x: number; y: number };
  ripple: number;
  reduced: boolean;
}

/** Canvas size = mascot size × PAD (room for stretch and wobble). */
export const INK_PAD = 1.75;
const LIME = "#d4f56b";
const VIOLET = "#b3a8ff";

interface Dot {
  x: number;
  y: number;
  d: number;
  a: number;
}

export function createInk() {
  let base: Dot[] = [];
  let bSize = 0;
  let s = 1;
  let sv = 0;
  let th = 0;
  let hx = 1;
  let hy = 1;
  let blinkAt = 2.5;
  let blinkEnd = 0;

  function build(size: number) {
    base = [];
    const R = size * 0.4;
    const g = size * 0.074;
    for (let row = -7; row <= 7; row++)
      for (let col = -7; col <= 7; col++) {
        const x = (col + (row & 1) * 0.5) * g;
        const y = row * g * 0.866;
        if (x * x + y * y <= R * R)
          base.push({ x, y, d: Math.hypot(x, y) / R, a: Math.atan2(y, x) });
      }
    bSize = size;
  }

  /** Draws one frame; returns the number of dots drawn. */
  function render(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    st: InkState,
    dt: number,
    t: number,
  ): number {
    if (bSize !== st.size) build(st.size);
    ctx.clearRect(0, 0, W, H);
    const size = st.size;
    const m = st.mood;
    const cx = W / 2;
    const cy = H / 2;
    const target = 1 + Math.min(st.speed / 800, 0.4);
    if (st.reduced) {
      s = 1;
      sv = 0;
    } else {
      sv += ((target - s) * 170 - sv * 11) * dt;
      s += sv * dt;
    }
    if (st.speed > 30) th = Math.atan2(st.vy, st.vx);
    const glad = m === "hover" || m === "happy";
    const tx = glad ? 1.14 : m === "error" ? 1.06 : 1;
    const ty = glad ? 0.84 : m === "error" ? 0.9 : 1;
    const kk = st.reduced ? 1 : 1 - Math.exp(-dt * 12);
    hx += (tx - hx) * kk;
    hy += (ty - hy) * kk;
    if (!st.reduced && t > blinkAt) {
      blinkEnd = t + 0.12;
      blinkAt = t + 2.8 + Math.random() * 3;
    }
    const blink = !st.reduced && t < blinkEnd;
    const ca = Math.cos(th);
    const sa = Math.sin(th);
    const inv = 1 / Math.sqrt(Math.max(0.5, s));
    const ex = st.look.x * size * 0.06;
    const ey = st.look.y * size * 0.05 + (m === "error" ? size * 0.03 : 0);
    const eyes: [number, number][] = [
      [-size * 0.165 + ex, -size * 0.09 + ey],
      [size * 0.165 + ex, -size * 0.09 + ey],
    ];
    const er = size * (glad ? 0.08 : m === "error" ? 0.055 : 0.065);
    const talk = m === "talk" && !st.reduced ? 1 + 0.05 * Math.sin(t * 14) : 1;
    const groups: [number, number, number][][] = [[], []];
    const bend = (x: number, y: number): [number, number] => {
      const u = x * ca + y * sa;
      const v = -x * sa + y * ca;
      const uu = u * s;
      const vv = v * inv;
      return [uu * ca - vv * sa, uu * sa + vv * ca];
    };
    for (const p of base) {
      const wob = st.reduced
        ? 1
        : 1 + 0.07 * Math.sin(3 * p.a + t * 2.2) * p.d + 0.04 * Math.sin(5 * p.a - t * 1.7) * p.d;
      const [x, y] = bend(p.x * wob * hx * talk, p.y * wob * hy * talk + (1 - hy) * size * 0.12);
      let r = size * 0.03 * (1 - Math.pow(p.d, 3) * 0.5);
      let grp = 0;
      if (m === "think") {
        // Reduced motion: a frozen ripple ring still reads as "thinking".
        const w = Math.sin(p.d * 9 - (st.reduced ? 2 : t * 7 * st.ripple));
        r *= 0.85 + 0.25 * w;
        if (w > 0.7) grp = 1;
      }
      groups[grp]?.push([cx + x, cy + y, r]);
    }
    const cols = [LIME, VIOLET];
    let n = 0;
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = cols[c] ?? LIME;
      ctx.beginPath();
      for (const [x, y, r] of groups[c] ?? []) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
        n++;
      }
      ctx.fill();
    }
    // Eyes: holes cut out of the ink.
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    ctx.beginPath();
    const lid = blink ? 0.2 : m === "error" ? 0.7 : 1.35;
    for (const [exx, eyy] of eyes) {
      const [x, y] = bend(exx * hx * talk, eyy * hy * talk + (1 - hy) * size * 0.12);
      ctx.moveTo(cx + x + er, cy + y);
      ctx.ellipse(cx + x, cy + y, er, er * lid, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
    return n;
  }

  return { render };
}

export type Ink = ReturnType<typeof createInk>;
