/**
 * The two iso highlights (HIGHLIGHTS-SPEC v3 §4, §5.4): OCR queue and DVP sandbox, drawn at build
 * time with the iso-glow kernel (./iso.ts, MIT, see ./LICENSE-iso-glow). A TS port of the
 * prototype's build/iso-scenes.mjs: same composition, cameras and numbers. Every class is
 * namespaced `hl-` like the lifted flat scenes (lib/highlights). `vec` is the screen-space motion
 * of the moving parts; lib/highlights/motion.json carries the same numbers (checked in iso.test.ts).
 */
import { kernel, proj, type Cam, type V2, type V3 } from "./iso";

const W = 300;
const f = (n: number) => +n.toFixed(1);
const T = (x: number, y: number, s: string, cls: string, anchor?: string) =>
  `<text class="${cls}" x="${f(x)}" y="${f(y)}"${anchor ? ` text-anchor="${anchor}"` : ""}>${s}</text>`;
const G = (cls: string, ...k: string[]) => `<g class="${cls}">${k.join("")}</g>`;
type Plane = "TOP" | "FRONT" | "SIDE";

/** Fit world points into [x0, x1] of the 300-wide viewBox at top margin y0, with one uniform zoom k. */
function fit(cam: Cam, pts: V3[], x0: number, x1: number, y0: number, hmax = Infinity) {
  const { D } = proj(cam);
  const d = pts.map((p) => D(...p));
  const a = Math.min(...d.map((p) => p[0])),
    b = Math.max(...d.map((p) => p[0]));
  const t = Math.min(...d.map((p) => p[1])),
    bot = Math.max(...d.map((p) => p[1]));
  const k = Math.min((x1 - x0) / (b - a), hmax / (bot - t));
  const K = kernel((x0 + x1) / 2 - ((a + b) / 2) * k, y0 - t * k, cam); // centred in [x0, x1]
  return {
    bottom: y0 + (bot - t) * k,
    P: (x: number, y: number, z: number) => K.P(x * k, y * k, z * k),
    d: (x: number, y: number, z = 0): V2 => {
      const q = K.D(x * k, y * k, z * k);
      return [f(q[0]), f(q[1])];
    },
    boxc: (x: number, y: number, z: number, w: number, dd: number, h: number, cls: string) =>
      K.boxc(x * k, y * k, z * k, w * k, dd * k, h * k, cls),
    face: (pl: Plane, x: number, y: number, z: number, w: number, h: number, cls: string) =>
      K.rect(K[pl](x * k, y * k, z * k), w * k, h * k, 0, cls),
  };
}

export interface IsoScene {
  /** viewBox height (the width is 300). */
  h: number;
  /** The drawing, without the <svg> wrapper. */
  body: string;
  cam: { yaw: number; el: number };
  /** Screen-space motion vectors (viewBox units) of the moving parts. */
  vec: Record<string, V2>;
}

/** Namespace every class `hl-`, as the lifted flat scenes are. */
const ns = (s: string) =>
  s.replace(
    /class="([^"]*)"/g,
    (_, c: string) =>
      `class="${c
        .split(/\s+/)
        .filter(Boolean)
        .map((x) => "hl-" + x)
        .join(" ")}"`,
  );

/** OCR · "Rendering never waits": render belt (fast pages) → pile → extract belt (one slow page) → model. */
function ocrQueue(): IsoScene {
  const cam = { yaw: 54, el: 22 };
  const pts: V3[] = [
    [0, 0, 0],
    [82, 30, 0],
    [0, 30, 0],
    [262, -4, 0],
    [262, 34, 0],
    [224, 34, 0],
    [224, -4, 34],
    [262, -4, 34],
  ];
  const Z = fit(cam, pts, 14, 286, 70);
  const k: string[] = [];
  k.push(Z.boxc(0, 0, 0, 82, 30, 4, "belt")); // render belt
  k.push(G("lit", Z.boxc(152, 0, 0, 60, 30, 4, "belt"))); // extract belt (accent)
  for (let j = 0; j < 3; j++) k.push(Z.boxc(104, 6, j * 4, 14, 18, 3, "pg")); // waiting pages
  k.push(Z.boxc(124, 6, 0, 14, 18, 3, "pg"));
  k.push(Z.boxc(224, -4, 0, 38, 38, 34, "model")); // model
  k.push(G("mglow lit", Z.face("TOP", 224, -4, 34, 38, 38, "face top")));
  for (let j = 0; j < 3; j++) k.push(G(`rp r${j}`, Z.boxc(2, 6, 4, 12, 18, 3, "pg")));
  k.push(G("ep", Z.boxc(154, 6, 4, 12, 18, 3, "pga")));
  // labels: above the far end of the render belt, under the extract belt, above the model
  const [rx, ry] = Z.P(41, 0, 4),
    [ex, ey] = Z.P(182, 30, 0),
    [mx, my] = Z.P(243, -4, 34);
  k.push(T(rx, ry - 22, "render · fast", "l", "middle"));
  k.push(T(ex - 52, ey + 30, "extract · waits", "l a"));
  k.push(T(mx - 4, my - 12, "model", "l m", "middle"));
  const h = Math.ceil(Math.max(Z.bottom, ey + 30) + 12);
  return { h, body: ns(k.join("")), cam, vec: { rp: Z.d(66, 0), ep: Z.d(56, 0) } };
}

/** DVP · "The rule runs inside a closed box": back walls, the rule, probe → glass wall (hit), server outside. */
function dvpSandbox(): IsoScene {
  const cam = { yaw: 30, el: 30 };
  const B = 100,
    H = 56;
  const pts: V3[] = [
    [0, 0, 0],
    [B, 0, 0],
    [0, B, 0],
    [B, B, 0],
    [0, 0, H],
    [B, 0, H],
    [0, B, H],
    [176, 40, 0],
    [220, 84, 0],
    [220, 40, 22],
    [176, 84, 0],
  ];
  const Z = fit(cam, pts, 22, 282, 52, 176);
  const k: string[] = [];
  k.push(G("gnd", Z.face("TOP", 0, 0, 0, B, B, "face top floor")));
  k.push(G("wall", Z.face("FRONT", 0, 0, H, B, H, "face"), Z.face("SIDE", 0, B, H, B, H, "face"))); // back walls
  k.push(G("lit", Z.boxc(38, 38, 0, 24, 24, 20, "fn"))); // the rule (accent)
  const [px, py] = Z.P(62, 50, 10);
  k.push(G("probe", `<circle class="fa" cx="${px}" cy="${py}" r="5"/>`));
  k.push(G("glass", Z.face("FRONT", 0, B, H, B, H, "face"), Z.face("SIDE", B, B, H, B, H, "face"))); // glass front walls
  const [hx, hy] = Z.P(B, 50, 10);
  k.push(
    G(
      "hit",
      `<path class="xa" d="M${f(hx - 8)} ${f(hy - 6)}L${f(hx + 4)} ${f(hy + 6)}M${f(hx + 4)} ${f(hy - 6)}L${f(hx - 8)} ${f(hy + 6)}"/>`,
    ),
  );
  k.push(Z.boxc(176, 40, 0, 44, 44, 22, "srv")); // server, outside the box
  const [tx, ty] = Z.P(0, 0, H),
    [sx, sy] = Z.P(220, 84, 0),
    [ox, oy] = Z.P(138, 62, 0);
  k.push(T(tx - 8, ty - 14, "sandbox", "l a"));
  k.push(T(ox - 18, oy + 34, "open", "lm a"));
  k.push(T(Math.min(sx + 8, 288), sy + 26, "server", "l m", "end"));
  const h = Math.ceil(Math.max(Z.bottom, sy + 26) + 12);
  return { h, body: ns(k.join("")), cam, vec: { probe: Z.d(30, 0) } };
}

/** The iso scenes by "<page>/<dive>" key. */
export const ISO_SCENES: Record<string, IsoScene> = {
  "ocr/queue": ocrQueue(),
  "dvp/sandbox": dvpSandbox(),
};

/** The full static SVG for an iso scene, the same wrapper as the lifted flat scenes. */
export const isoSvg = (key: string, s: IsoScene) =>
  `<svg xmlns="http://www.w3.org/2000/svg" class="hl-fig hl-s-${key.replace("/", "-")}" data-scene="${key}" viewBox="0 0 ${W} ${s.h}" aria-hidden="true" focusable="false">${s.body}</svg>`;
