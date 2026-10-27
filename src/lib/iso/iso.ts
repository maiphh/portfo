/*
 * Isometric kernel, copied from the iso-glow skill (assets/gallery.html, the ISO block),
 * which takes it from iso-figure. MIT licence, full text in ./LICENSE-iso-glow:
 *   Copyright (c) 2026 April Zhu (iso-glow)
 *   Copyright (c) 2026 Tolga Cohce (iso-figure)
 * Changes for Portfo: ES module export and TypeScript types, `frame()` frames to the scene's own
 * aspect, numbers are rounded to 2 decimals, and the fixed 30° camera became a parameter:
 * cam = { yaw, el } in degrees (yaw 0..90 turns the world about z, el 0 = elevation, 90 = plan).
 * The defaults (yaw 45, el 35.26) reproduce the original projection exactly.
 * Faces drawn are always +x (SIDE), +y (FRONT) and top, which stay visible for yaw 0..90, el 0..90.
 * Runs at build time only (components/case/IsoPlate.astro); the client gets the SVG it returns.
 */
export type V2 = [number, number];
export type V3 = [number, number, number];

/** A camera for one figure. Only yaw/el feed the projection; the rest is read by scene.ts. */
export interface Cam {
  yaw?: number;
  el?: number;
  /** Where the story runs on screen: "x" | "up" | "scr" | "down" or an angle in degrees. */
  flow?: "x" | "up" | "scr" | "down" | number;
  A?: number;
  B?: number;
  Amax?: number;
  mirror?: boolean;
  ground?: "slab" | "grid" | "outline" | "none";
  gridStep?: number;
  crop?: [number, number, number, number, number?];
  /** Label anchor overrides, by label text. */
  lab?: Record<string, string>;
  /** Flow-space nudges for a label's anchor point [du, dv, dz?], by label text. */
  nudge?: Record<string, [number, number, number?]>;
  /** Screen-space label nudges in stage px [dx, dy], by label text. */
  sn?: Record<string, [number, number]>;
  cutaway?: number;
  upright?: boolean;
  explode?: number;
  shift?: string;
}

const DEG = Math.PI / 180;
const f = (n: number) => +n.toFixed(2);
export const ISO_EL = Math.atan(1 / Math.SQRT2) / DEG;

export function proj(cam: Cam = {}) {
  const th = Math.min(90, Math.max(0, cam.yaw ?? 45)) * DEG;
  const ph = Math.min(90, Math.max(0, cam.el ?? ISO_EL)) * DEG;
  const s = Math.sqrt(1.5);
  const ct = Math.cos(th),
    st = Math.sin(th),
    sp = Math.sin(ph),
    cp = Math.cos(ph);
  const D = (x: number, y: number, z: number): V2 => [
    s * (x * ct - y * st),
    s * ((x * st + y * ct) * sp - z * cp),
  ];
  const V: V3 = [st * cp, ct * cp, sp];
  return { D, V, ct, st, sp, cp, s };
}

export type Kernel = ReturnType<typeof kernel>;

export function kernel(OX: number, OY: number, cam: Cam) {
  const pr = proj(cam),
    D = pr.D;
  const P = (x: number, y: number, z: number): V2 => {
    const d = D(x, y, z);
    return [f(d[0] + OX), f(d[1] + OY)];
  };
  const plane = (O: V3, U: V3, V: V3) => {
    const o = P(...O),
      u = D(...U),
      v = D(...V);
    return `matrix(${f(u[0])} ${f(u[1])} ${f(v[0])} ${f(v[1])} ${o[0]} ${o[1]})`;
  };
  const TOP = (x: number, y: number, z: number) => plane([x, y, z], [1, 0, 0], [0, 1, 0]);
  const FRONT = (x: number, y: number, z: number) => plane([x, y, z], [1, 0, 0], [0, 0, -1]);
  const SIDE = (x: number, y: number, z: number) => plane([x, y, z], [0, -1, 0], [0, 0, -1]);
  const rect = (t: string, w: number, h: number, r = 0, cls = "face") =>
    `<g transform="${t}"><rect class="${cls}" width="${w}" height="${h}" rx="${r}"/></g>`;
  // the visible half of a rounded wall: outward normals within 90° of the camera's ground direction
  const beta = Math.atan2(pr.V[1], pr.V[0]);
  const rounded = (
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    r: number,
    cls: string,
  ) => {
    r = Math.min(r, w / 2, d / 2);
    const n = 10,
      z1 = z + h,
      H = Math.PI / 2,
      c = cls ? " " + cls : "";
    const cens: V2[] = [
      [x + w - r, y + r],
      [x + w - r, y + d - r],
      [x + r, y + d - r],
      [x + r, y + r],
    ];
    const at = (a: number, q: number): V2 => {
      const [cx, cy] = cens[q] ?? cens[0] ?? [0, 0];
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const quad = (a: number) => ((Math.floor((a + H) / H) % 4) + 4) % 4; // normal angle -> corner (-90..0 is corner 0)
    const arc = (a0: number, a1: number) => {
      const o: V2[] = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        o.push(at(a, quad(a)));
      }
      return o;
    };
    const ring = [
      ...arc(-H, -1e-9),
      ...arc(0, H - 1e-9),
      ...arc(H, 2 * H - 1e-9),
      ...arc(2 * H, 3 * H - 1e-9),
    ];
    // visible span [beta-90°, beta+90°], split at corner boundaries so straight edges join
    const vis: V2[] = [];
    const a0 = beta - H,
      a1 = beta + H;
    let a = a0;
    while (a < a1 - 1e-9) {
      const q = quad(a + 1e-9),
        b = Math.min(a1, Math.floor((a + 1e-9 + H) / H) * H); // up to the next corner boundary
      for (let i = 0; i <= n; i++) {
        const t = a + ((b - a) * i) / n;
        vis.push(at(t, q));
      }
      a = b;
    }
    const d3 = (pts: V3[]) => "M" + pts.map((p) => P(...p).join(" ")).join("L") + "Z";
    const wall: V3[] = [
      ...vis.map(([a, b]): V3 => [a, b, z]),
      ...vis
        .slice()
        .reverse()
        .map(([a, b]): V3 => [a, b, z1]),
    ];
    return `<path class="face${c}" d="${d3(wall)}"/><path class="face top${c}" d="${d3(ring.map(([a, b]): V3 => [a, b, z1]))}"/>`;
  };
  const box = (x: number, y: number, z: number, w: number, d: number, h: number, r = 0) =>
    r > 0
      ? rounded(x, y, z, w, d, h, r, "")
      : rect(SIDE(x + w, y + d, z + h), d, h) +
        rect(FRONT(x, y + d, z + h), w, h) +
        rect(TOP(x, y, z + h), w, d, 0, "face top");
  const boxc = (
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    r: number,
    cls: string,
  ) =>
    r > 0
      ? rounded(x, y, z, w, d, h, r, cls)
      : rect(SIDE(x + w, y + d, z + h), d, h, 0, "face " + cls) +
        rect(FRONT(x, y + d, z + h), w, h, 0, "face " + cls) +
        rect(TOP(x, y, z + h), w, d, 0, "face top " + cls);
  const path = (pts: V3[]) => "M" + pts.map((p) => P(...p).join(" ")).join("L");
  return { P, D, V: pr.V, sp: pr.sp, plane, TOP, FRONT, SIDE, rect, box, boxc, path, cam };
}

export const slits = (
  a0: number,
  a1: number,
  step: number,
  b0: number,
  b1: number,
  vertical = true,
  cls = "detail",
) => {
  let s = "";
  for (let a = a0; a <= a1 + 1e-6; a += step)
    s += vertical
      ? `<line class="${cls}" x1="${f(a)}" y1="${b0}" x2="${f(a)}" y2="${b1}"/>`
      : `<line class="${cls}" x1="${b0}" y1="${f(a)}" x2="${b1}" y2="${f(a)}"/>`;
  return s;
};

export const esc = (s: unknown) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A screen-space extra for frame(): a 3D point plus a pixel offset. */
export type Extra = [p: V3, dx: number, dy: number];

/** frame(): 3D points (+ screen-space extras) -> kernel + viewBox padded to an aspect (iso-glow, MIT). */
export function frame(
  points: V3[],
  margin = 0.09,
  aspect = 4 / 3,
  cam: Cam = {},
  extra: Extra[] = [],
) {
  const { D } = proj(cam);
  const d = [
    ...points.map((p) => D(...p)),
    ...extra.map(([p, dx, dy]): V2 => {
      const q = D(...p);
      return [q[0] + dx, q[1] + dy];
    }),
  ];
  const x0 = Math.min(...d.map((p) => p[0])),
    x1 = Math.max(...d.map((p) => p[0]));
  const y0 = Math.min(...d.map((p) => p[1])),
    y1 = Math.max(...d.map((p) => p[1]));
  const m = margin * Math.max(x1 - x0, y1 - y0);
  let w = x1 - x0 + 2 * m,
    h = y1 - y0 + 2 * m;
  let ox = m - x0,
    oy = m - y0;
  if (w / h < aspect) {
    const nw = h * aspect;
    ox += (nw - w) / 2;
    w = nw;
  } else {
    const nh = w / aspect;
    oy += (nh - h) / 2;
    h = nh;
  }
  return {
    ...kernel(ox, oy, cam),
    viewBox: `0 0 ${w.toFixed(1)} ${h.toFixed(1)}`,
    W: +w.toFixed(1),
    H: +h.toFixed(1),
  };
}
