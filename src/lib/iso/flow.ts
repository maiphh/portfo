/**
 * Highlights (flow) scene renderer, ported from the v2 prototype's build/draw.mjs
 * (HIGHLIGHTS-SPEC v2 §2.3). It uses the iso-glow kernel in ./iso.ts (MIT, see ./LICENSE-iso-glow).
 *
 * A scene is a few objects, wires and one numbered marker per step. No words are drawn inside
 * the SVG; the step sentences sit in a list beside it (components/case/FlowFigure.astro). The
 * markup is the static picture shown without JS and with reduced motion: wires that ever carry
 * the flow are faintly lit ("path"), and a part is struck ("x") only if it is still struck at
 * the last step. scripts/case/flow.ts loops through the steps, reading data-lit / data-x.
 * Runs at build time only.
 */
import { esc, frame, type Cam, type Kernel, type V3 } from "./iso";

type Box = [x: number, y: number, z: number, w: number, d: number, h: number];
/** A top rectangle that can be struck: [x, y, z, w, d]. */
type Top = [x: number, y: number, z: number, w: number, d: number];

export interface FlowObj {
  id: string;
  bb: V3[];
  c: V3;
  top: Top | null;
  /** 1-based steps in which the part lights up. */
  lit?: number[];
  /** 1-based steps in which the part is struck. */
  x?: number[];
  /** RAG's citation part: violet, the page's only second colour. */
  cite?: boolean;
  draw: (K: Kernel) => string;
}
export interface FlowWire {
  pts: ([number, number] | V3)[];
  lit?: number[];
  x?: number[];
}
export interface FlowView {
  cam: Cam;
  name: string;
  /** A fixed aspect, or [lo, hi]: hug the drawing and clamp. */
  asp?: number | [number, number];
  margin?: number;
  /** [left, top, right, bottom] as fractions of the fitted frame; markers must stay inside. */
  crop?: [l: number, t: number, r: number, b: number];
}
export interface FlowScene {
  objs: FlowObj[];
  wires: FlowWire[];
  /** One 3D point per marker, keyed 1…N (N = the dive's flow.steps.length). */
  marks: Record<number, V3>;
  ground?: [x: number, y: number, w: number, d: number];
  grid?: number;
  dk: FlowView;
  ph: FlowView;
}

const r1 = (n: number) => +(+n).toFixed(1);
const lineSet = (
  K: Kernel,
  face: string,
  w: number,
  h: number,
  fr: number[],
  x1 = 0.15,
  x2 = 0.8,
) =>
  `<g transform="${face}">${fr
    .map(
      (f) =>
        `<line class="ln" x1="${r1(w * x1)}" y1="${r1(h * f)}" x2="${r1(w * x2)}" y2="${r1(h * f)}"/>`,
    )
    .join("")}</g>`;

/** The primitives: (K, …numbers) → svg. Faces get class "face" / "face top" from the kernel. */
export const prim = {
  slab: (K: Kernel, x: number, y: number, z: number, w: number, d: number, h: number, r = 0) =>
    K.box(x, y, z, w, d, h, r),
  sheets: (K: Kernel, x: number, y: number, z: number, w: number, d: number, n = 3) => {
    let s = "";
    for (let i = 0; i < n; i++) s += K.box(x + i * 3, y - i * 3, z + i * 5, w, d, 3);
    const k = n - 1;
    return (
      s + lineSet(K, K.TOP(x + k * 3, y - k * 3, z + k * 5 + 3), w, d, [0.3, 0.5, 0.7], 0.18, 0.82)
    );
  },
  chip: (K: Kernel, x: number, y: number, z: number, s: number) =>
    K.box(x, y, z, s, s, 8) + K.box(x + s * 0.28, y + s * 0.28, z + 8, s * 0.44, s * 0.44, 7),
  server: (K: Kernel, x: number, y: number, z: number, w: number, d: number, h: number) =>
    K.box(x, y, z, w, d, h) +
    lineSet(K, K.FRONT(x, y + d, z + h), w, h, [0.25, 0.45, 0.65], 0.15, 0.6),
  cyl: (K: Kernel, x: number, y: number, z: number, s: number, h: number) =>
    K.box(x, y, z, s, s, h * 0.3, s / 2) +
    K.box(x, y, z + h * 0.35, s, s, h * 0.3, s / 2) +
    K.box(x, y, z + h * 0.7, s, s, h * 0.3, s / 2),
  panel: (K: Kernel, x: number, y: number, z: number, w: number, h: number, t = 5) =>
    K.box(x, y, z, w, t, h),
  card: (K: Kernel, x: number, y: number, z: number, w: number, h: number) =>
    K.box(x - 4, y - 4, z, w + 8, 12, 4) +
    K.box(x, y, z + 4, w, 4, h) +
    lineSet(K, K.FRONT(x, y + 4, z + 4 + h), w, h, [0.25, 0.45, 0.65]),
  gate: (K: Kernel, x: number, y: number, z: number, d: number, h: number) =>
    K.box(x, y, z, 8, 8, h) + K.box(x, y + d - 8, z, 8, 8, h) + K.box(x, y, z + h, 8, d, 6),
  tile: (K: Kernel, x: number, y: number, z: number, w: number, d: number, h = 4) =>
    K.box(x, y, z, w, d, h, Math.min(w, d) * 0.2),
  key: (K: Kernel, x: number, y: number, z: number) =>
    K.box(x, y, z, 14, 14, 5, 7) +
    K.box(x + 14, y + 5, z, 22, 4, 4) +
    K.box(x + 28, y + 9, z, 4, 4, 4),
};
export type PrimKind = keyof typeof prim;

/** Ruled lines on a face (a card's or a panel's text), the first one shorter. */
export const lines = (K: Kernel, face: string, w: number, h: number, fr: number[]) =>
  `<g transform="${face}">${fr
    .map(
      (f) =>
        `<line class="ln" x1="${(w * 0.14).toFixed(1)}" y1="${(h * f).toFixed(1)}" x2="${(w * (f === fr[0] ? 0.55 : 0.84)).toFixed(1)}" y2="${(h * f).toFixed(1)}"/>`,
    )
    .join("")}</g>`;

interface ObjMore {
  lit?: number[];
  x?: number[];
  cite?: boolean;
  /** The arguments for the primitive, when they differ from the box. */
  pargs?: number[];
  /** false = nothing to strike; else the struck top rectangle (defaults to the box's top). */
  top?: Top | false;
  /** Depth-sort centre, when the box's centre sorts wrong. */
  c?: V3;
  draw?: (K: Kernel) => string;
}

/** An object with its bounding box from a box footprint. */
export function O(id: string, kind: PrimKind, args: Box, more: ObjMore = {}): FlowObj {
  const [x, y, z, w, d, h] = args;
  const bb: V3[] = [
    [x, y, z],
    [x + w, y, z],
    [x, y + d, z],
    [x + w, y + d, z],
    [x, y, z + h],
    [x + w, y + d, z + h],
    [x + w, y, z + h],
    [x, y + d, z + h],
  ];
  const { pargs, top, draw, c, ...rest } = more;
  const fn = prim[kind] as (K: Kernel, ...a: number[]) => string;
  return {
    id,
    bb,
    c: c ?? [x + w / 2, y + d / 2, z + h / 2],
    top: top === false ? null : (top ?? [x, y, z + h, w, d]),
    ...rest,
    draw: draw ?? ((K) => fn(K, ...(pargs ?? args))),
  };
}

/** A wire through ground points ([x, y]) or 3D points. */
export const W = (pts: FlowWire["pts"], more: Omit<FlowWire, "pts"> = {}): FlowWire => ({
  pts,
  ...more,
});

// struck overlay on a top rectangle: dashed outline + an x, in ink (a state, not a second colour)
const strike = (K: Kernel, [x, y, z, w, d]: Top) =>
  `<g transform="${K.TOP(x, y, z)}"><rect class="xr" width="${w}" height="${d}"/><path class="xx" d="M${r1(w * 0.3)} ${r1(d * 0.3)}L${r1(w * 0.7)} ${r1(d * 0.7)}M${r1(w * 0.7)} ${r1(d * 0.3)}L${r1(w * 0.3)} ${r1(d * 0.7)}"/></g>`;

const depth = (K: Kernel, p: V3) => p[0] * K.V[0] + p[1] * K.V[1] + p[2] * K.V[2];
const p3 = (p: [number, number] | V3): V3 => [p[0], p[1], p[2] ?? 0];
const cls = (o: { x?: number[]; lit?: number[] }, N: number) =>
  ["o", o.x?.includes(N) ? "x" : "", o.lit?.length ? "path" : ""].filter(Boolean).join(" ");
const attr = (o: { x?: number[]; lit?: number[] }) =>
  `data-lit="${(o.lit ?? []).join(",")}" data-x="${(o.x ?? []).join(",")}"`;

// aspect: a number, or [lo, hi] = hug the drawing and clamp (so no empty band under it)
function fit(pts: V3[], v: FlowView) {
  const m = v.margin ?? 0.06;
  if (!Array.isArray(v.asp)) return frame(pts, m, v.asp, v.cam);
  const K0 = frame(pts, m, 0, v.cam),
    a = K0.W / K0.H,
    [lo, hi] = v.asp;
  return a < lo || a > hi ? frame(pts, m, a < lo ? lo : hi, v.cam) : K0;
}

const gridLines = (K: Kernel, x: number, y: number, w: number, d: number, step: number) => {
  let s = `<g transform="${K.TOP(x, y, 0)}">`;
  for (let a = step; a < w; a += step)
    s += `<line class="gl" x1="${a}" y1="0" x2="${a}" y2="${d}"/>`;
  for (let b = step; b < d; b += step)
    s += `<line class="gl" x1="0" y1="${b}" x2="${w}" y2="${b}"/>`;
  return s + "</g>";
};

/** Marker centre as a fraction of the (cropped) frame, per marker. Throws when one leaves it. */
export interface Rendered {
  html: string;
  marks: { n: number; lx: number; ty: number }[];
}

/** One view (desktop or phone) of a scene: div.fig.{kind} with the SVG and the HTML markers. */
export function render(sc: FlowScene, v: FlowView & { kind: "dk" | "ph" }, N: number): Rendered {
  const pts: V3[] = [];
  for (const o of sc.objs) pts.push(...o.bb);
  for (const w of sc.wires) pts.push(...w.pts.map(p3));
  pts.push(...Object.values(sc.marks));
  const K = fit(pts, v);
  let svg = "";
  if (sc.ground) {
    const [x, y, w, d] = sc.ground;
    svg += `<g class="gnd">${K.box(x, y, -6, w, d, 6)}${sc.grid ? gridLines(K, x, y, w, d, sc.grid) : ""}</g>`;
  }
  sc.wires.forEach((w, i) => {
    const ps = w.pts.map(p3),
      d = K.path(ps),
      scr = ps.map((p) => K.P(...p));
    svg += `<g class="${cls(w, N)} w" data-i="${i}" ${attr(w)} data-pts="${scr.map((p) => p.map(r1).join(",")).join(" ")}"><path class="wb" d="${d}"/><g class="lit"><path class="wg" d="${d}"/><path class="wc" d="${d}"/></g><path class="wx" d="${d}"/></g>`;
  });
  const objs = sc.objs.map((o) => ({ o, k: depth(K, o.c) })).sort((a, b) => a.k - b.k);
  for (const { o } of objs) {
    const g = o.draw(K);
    svg += `<g class="${cls({ x: o.x }, N)}${o.cite ? " cite" : ""}" data-id="${o.id}" ${attr(o)}><g class="mv"><g class="base">${g}</g><g class="lit">${g}</g>${o.top ? `<g class="xm">${strike(K, o.top)}</g>` : ""}</g></g>`;
  }
  // one travelling dot per wire that carries the flow (moved by transform only; hidden statically)
  svg += sc.wires
    .map((w, i) =>
      w.lit?.length
        ? `<g class="dot" data-w="${i}"><circle class="dh" r="7"/><circle class="dc" r="3"/></g>`
        : "",
    )
    .join("");
  let [VX, VY, VW, VH] = K.viewBox.split(" ").map(Number) as [number, number, number, number];
  if (v.crop) {
    const [l, t, r, b] = v.crop;
    VX = r1(VW * l);
    VY = r1(VH * t);
    VW = r1(VW * (r - l));
    VH = r1(VH * (b - t));
  }
  const marks = Object.entries(sc.marks).map(([n, p]) => {
    const q = K.P(...p),
      lx = (q[0] - VX) / VW,
      ty = (q[1] - VY) / VH;
    if (lx < 0.03 || lx > 0.97 || ty < 0.04 || ty > 0.96)
      throw new Error(
        `marker ${n} outside the frame in ${v.name}: ${lx.toFixed(2)},${ty.toFixed(2)}`,
      );
    return { n: +n, lx, ty };
  });
  const mk = marks
    .map(
      (m) =>
        `<span class="hl-mk" data-n="${m.n}" style="left:clamp(15px,${r1(m.lx * 100)}%,calc(100% - 15px));top:clamp(15px,${r1(m.ty * 100)}%,calc(100% - 15px))" aria-hidden="true">${m.n}</span>`,
    )
    .join("");
  const html = `<div class="fig ${v.kind}" style="aspect-ratio:${VW}/${VH};--a:${r1((VW / VH) * 100) / 100}" data-cam="${esc(v.name)}"><svg viewBox="${VX} ${VY} ${VW} ${VH}"${v.crop ? " data-crop" : ""} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">${svg}</svg>${mk}</div>`;
  return { html, marks };
}
