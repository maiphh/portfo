/*
 * Object pack for the Highlights plates (iso-glow vocabulary: hairline faces, slits, one lit accent),
 * ported from the prototype's build/scene.mjs `O`. iso-glow kernel: MIT, © 2026 April Zhu;
 * iso-figure © 2026 Tolga Cohce (./LICENSE-iso-glow).
 */
import { G, r1, slits, type Kernel, type SceneT, type Spec } from "./scene";

const sheets = (
  K: Kernel,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  n = 3,
  lines = true,
) => {
  let g = "";
  for (let i = 0; i < n; i++) g += K.box(x - i * 3, y - i * 3, z + i * 5, w, d, 3);
  const t = z + (n - 1) * 5 + 3,
    ox = x - (n - 1) * 3,
    oy = y - (n - 1) * 3;
  if (lines)
    g += `<g transform="${K.TOP(ox, oy, t)}">${slits(10, d - 12, 8, 8, w - 10, false, "detail strong")}</g>`;
  return g;
};

const rack = (
  K: Kernel,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  leds = "",
) => {
  let g = K.box(x, y, z, w, d, h);
  g += `<g transform="${K.FRONT(x, y + d, z + h)}">${slits(10, h - 10, 6, 8, w - 18, false)}${leds}</g>`;
  g += `<g transform="${K.SIDE(x + w, y + d, z + h)}">${slits(10, h - 10, 6, 8, d - 8, false)}</g>`;
  g += `<g transform="${K.TOP(x, y, z + h)}"><rect class="detail" x="6" y="6" width="${w - 12}" height="${d - 12}" rx="3"/></g>`;
  return g;
};

const chipBase = (K: Kernel, x: number, y: number, z: number, s: number) =>
  K.box(x, y, z, s, s, 8) +
  `<g transform="${K.FRONT(x, y + s, z + 8)}">${slits(6, s - 6, 6, 1, 8)}</g><g transform="${K.SIDE(x + s, y + s, z + 8)}">${slits(6, s - 6, 6, 1, 8)}</g>`;

/** a chip with a lit core; spec lights the core */
const chip = (
  S: SceneT,
  K: Kernel,
  x: number,
  y: number,
  z: number,
  s: number,
  spec: Spec,
  k?: string,
) => {
  const c = s * 0.3;
  return (
    chipBase(K, x, y, z, s) +
    G(S, spec, "lt core", K.box(x + c, y + c, z + 8, s - 2 * c, s - 2 * c, 9, 3), k)
  );
};

const disc = (K: Kernel, cx: number, cy: number, z: number, r: number, h: number) =>
  K.box(cx - r, cy - r, z, 2 * r, 2 * r, h, r);

/** a workbook: a slab with a grid of cells on top; lit(i,j) -> spec */
const grid = (
  S: SceneT,
  K: Kernel,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  cols: number,
  rows: number,
  lit: (i: number, j: number) => Spec | null = () => null,
) => {
  const g = K.box(x, y, z, w, d, h);
  let cells = "";
  const cw = (w - 12) / cols,
    chh = (d - 12) / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const sp = lit(i, j);
      const s = sp ? S.st(sp) : { a: "", c: "" };
      cells += `<rect class="cell ${s.c}"${s.a} x="${r1(6 + i * cw + 1.5)}" y="${r1(6 + j * chh + 1.5)}" width="${r1(cw - 3)}" height="${r1(chh - 3)}" rx="1.5"/>`;
    }
  return g + `<g transform="${K.TOP(x, y, z + h)}">${cells}</g>`;
};

/** a standing card (answer, receipt, screen) */
const card = (
  K: Kernel,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  lines = 3,
  cls = "detail strong",
) => {
  let g = K.box(x, y, z, w, 6, 4) + K.box(x + 2, y + 2, z + 4, w - 4, 3, h);
  g += `<g transform="${K.FRONT(x + 2, y + 5, z + 4 + h)}">${slits(8, 8 + (lines - 1) * 7, 7, 5, w - 10, false, cls)}</g>`;
  return g;
};

/** a gate: two posts and a bar; spec lights the bar */
const gate = (
  S: SceneT,
  K: Kernel,
  x: number,
  y: number,
  z: number,
  d: number,
  h: number,
  spec: Spec,
  k?: string,
) =>
  K.box(x, y, z, 8, 8, h) +
  K.box(x, y + d - 8, z, 8, 8, h) +
  G(S, spec, "lt", K.box(x, y + 4, z + h - 6, 8, d - 8, 5), k);

const envelope = (K: Kernel, x: number, y: number, z: number, w: number, d: number) =>
  K.box(x, y, z, w, d, 6, 0) +
  `<g transform="${K.TOP(x, y, z + 6)}"><path class="detail strong" d="M2 2 L${w / 2} ${d * 0.55} L${w - 2} 2"/></g>`;

const clock = (K: Kernel, cx: number, cy: number, z: number, r: number) =>
  K.box(cx - r, cy - r, z, 2 * r, 2 * r, 8, r) +
  `<g transform="${K.TOP(cx - r, cy - r, z + 8)}"><circle class="detail strong" cx="${r}" cy="${r}" r="${r * 0.72}"/><path class="hand" d="M${r} ${r} L${r} ${r * 0.45} M${r} ${r} L${r * 1.45} ${r}"/></g>`;

const key = (K: Kernel, x: number, y: number, z: number) =>
  K.box(x, y, z, 30, 16, 5, 8) +
  K.box(x + 26, y + 5, z, 26, 6, 5) +
  K.box(x + 40, y + 10, z, 5, 6, 5) +
  K.box(x + 48, y + 10, z, 4, 6, 5);

/** a monitor on a foot; the glass lights with the group */
const screen = (K: Kernel, x: number, y: number, z: number, w = 56, h = 36) =>
  K.box(x + w * 0.2, y + 18, z, w * 0.6, 14, 4) +
  K.box(x, y + 20, z + 4, w, 6, h) +
  `<g transform="${K.FRONT(x, y + 26, z + 4 + h)}"><rect class="glass" x="4" y="4" width="${w - 8}" height="${h - 8}" rx="1.5"/></g>`;

const tile = (K: Kernel, x: number, y: number, z: number, w: number, d: number, h = 6, r = 3) =>
  K.box(x, y, z, w, d, h, r);

/** an X mark drawn on a top face */
const xmark = (K: Kernel, x: number, y: number, z: number, s: number) =>
  `<g transform="${K.TOP(x, y, z)}"><path class="xm" d="M${s * 0.2} ${s * 0.2} L${s * 0.8} ${s * 0.8} M${s * 0.8} ${s * 0.2} L${s * 0.2} ${s * 0.8}"/></g>`;

export const O = {
  sheets,
  rack,
  chipBase,
  chip,
  disc,
  grid,
  card,
  gate,
  envelope,
  clock,
  key,
  screen,
  tile,
  xmark,
};
