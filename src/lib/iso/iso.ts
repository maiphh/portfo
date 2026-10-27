/*
 * Isometric kernel, copied from the iso-glow skill (assets/gallery.html, the ISO block),
 * which takes it from iso-figure. MIT licence, full text in ./LICENSE-iso-glow:
 *   Copyright (c) 2026 April Zhu (iso-glow)
 *   Copyright (c) 2026 Tolga Cohce (iso-figure)
 * Changes for Portfo: ES module export and TypeScript types, numbers are rounded to 2 decimals,
 * and the fixed 30° camera became a parameter: cam = { yaw, el } in degrees (yaw 0..90 turns the
 * world about z, el 0 = elevation, 90 = plan). The defaults (yaw 45, el 35.26) reproduce the
 * original projection exactly. Faces drawn are always +x (SIDE), +y (FRONT) and top, which stay
 * visible for yaw 0..90, el 0..90. Only the parts the highlights use are kept (square boxes and
 * faces; ./scenes.ts). Runs at build time only; the client gets the SVG it returns.
 */
export type V2 = [number, number];
export type V3 = [number, number, number];

/** An axonometric camera, in degrees. */
export type Cam = { yaw?: number; el?: number };

const DEG = Math.PI / 180;
const f = (n: number) => +n.toFixed(2);
export const ISO_EL = Math.atan(1 / Math.SQRT2) / DEG;

export function proj(cam: Cam = {}): { D: (x: number, y: number, z: number) => V2 } {
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
  return { D };
}

export function kernel(OX: number, OY: number, cam: Cam) {
  const { D } = proj(cam);
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
  /** A square box with a class on each face. */
  const boxc = (x: number, y: number, z: number, w: number, d: number, h: number, cls: string) =>
    rect(SIDE(x + w, y + d, z + h), d, h, 0, "face " + cls) +
    rect(FRONT(x, y + d, z + h), w, h, 0, "face " + cls) +
    rect(TOP(x, y, z + h), w, d, 0, "face top " + cls);
  return { P, D, TOP, FRONT, SIDE, rect, boxc };
}
