/*
 * Scene graph for the Highlights plates, ported from the prototype's build/scene.mjs.
 * Drawn at build time with the iso-glow kernel (./iso.ts, MIT, © 2026 April Zhu; iso-figure © 2026 Tolga Cohce,
 * see ./LICENSE-iso-glow), so the end state is in the HTML.
 *
 * Scenes are written in flow space (u along the story, v across). Each figure gets its own camera (yaw/elevation),
 * flow direction and ground (slab, blueprint grid, outline or none).
 * Phone: the camera turns so u runs down the screen and the plate becomes a tall card.
 * State engine: data-s-<cls>="ranges" / data-m-<mode>-<cls>="ranges"; the build bakes in the last step of the
 * default mode (no-JS / reduced motion), and src/scripts/case/plates.ts replays the steps.
 *
 * Changes from the prototype: the camera comes in through cfg (no module state); pulses are emitted as
 * `circle.spark` with build-sampled `data-pts` (moved with transforms, not a dash offset); labels without a
 * tip key don't emit data-k.
 */
import {
  esc,
  frame,
  proj,
  slits,
  type Cam,
  type Extra,
  type Kernel,
  type V2,
  type V3,
} from "./iso";

export { esc, slits };
export type { Cam, Kernel, V2, V3 };

export const Z0 = 10;
export const r1 = (n: number) => +n.toFixed(1);

/** A class → step-range map ("0-", "1-3", "2,4"), plus per-mode overrides under "$<mode>". */
export interface Spec {
  [k: string]: string | Record<string, string> | undefined;
}

export const inR = (s: number, rs: string) =>
  String(rs)
    .split(",")
    .some((r) => {
      if (!r) return false;
      const [a = "", b] = r.split("-");
      const lo = +a;
      const hi = b === undefined ? lo : b === "" ? 1e9 : +b;
      return s >= lo && s <= hi;
    });

export interface Lab {
  /** anchor on desktop: n | s | e | w | c */
  a?: string;
  /** anchor on the phone */
  pa?: string;
  t: string;
  s?: string | null;
  cls?: string;
  /** the drawn part ([data-k]) that opens the same tip */
  k?: string;
  tip?: string;
  spec?: Spec;
  fixed?: boolean;
}

type Draw = (K: Kernel) => string;
type PutDraw = (K: Kernel, x: number, y: number, z: number) => string;
export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  cx: number;
  cy: number;
  u: number;
  v: number;
}

export interface SceneCfg {
  ph: boolean;
  cam: Cam;
  n?: Record<string, number>;
  mode?: string;
  plate?: number;
}

const DEG = Math.PI / 180;

export function Scene(cfg: SceneCfg) {
  const { ph, n = { d: 1 }, mode = "d" } = cfg;
  const cam: Cam = { ...cfg.cam };
  const pr = proj(cam);
  const flow = cam.flow ?? (ph ? "down" : "x");
  const yaw = cam.yaw ?? 45;
  const psi =
    (flow === "x"
      ? 0
      : flow === "up"
        ? -90
        : flow === "scr"
          ? -yaw
          : flow === "down"
            ? 90 - yaw
            : +flow) * DEG;
  const du: V2 = [Math.cos(psi), Math.sin(psi)];
  const mirror = flow === "down" || cam.mirror;
  const dv: V2 = mirror ? [Math.sin(psi), -Math.cos(psi)] : [-Math.sin(psi), Math.cos(psi)];
  const len = ([x, y]: V2) => Math.hypot(...pr.D(x, y, 0));
  const A =
    cam.A ??
    (ph && flow === "down" ? Math.min(cam.Amax ?? 1.8, 0.95 / (pr.s * pr.sp)) : 1 / len(du));
  const B = cam.B ?? (ph && flow === "down" ? 0.866 / pr.s : 1);
  const map = (u: number, v: number): V2 => [
    A * u * du[0] + B * v * dv[0],
    A * u * du[1] + B * v * dv[1],
  ];
  const det = A * B * (du[0] * dv[1] - dv[0] * du[1]);
  const unmap = (x: number, y: number): V2 => [
    (x * B * dv[1] - y * B * dv[0]) / det,
    (A * du[0] * y - A * du[1] * x) / det,
  ];
  const items: { depth: number; draw: Draw }[] = [];
  const pts: V3[] = [];
  const labels: (Lab & { p: V3 })[] = [];
  const wires: { p3: V3[]; spec: Spec }[] = [];
  const pulses: { p3: V3[]; spec: Spec }[] = [];
  const floor: Draw[] = [];
  const last = (n[mode] ?? 1) - 1;
  const st = (spec: Spec = {}) => {
    let a = "";
    const c: string[] = [];
    for (const [k, v] of Object.entries(spec)) {
      if (v === undefined) continue;
      if (k.startsWith("$")) {
        if (typeof v === "string") continue;
        const m = k.slice(1);
        for (const [ck, cv] of Object.entries(v)) {
          a += ` data-m-${m}-${ck}="${cv}"`;
          if (m === mode && inR((n[m] ?? 1) - 1, cv)) c.push(ck);
        }
      } else if (typeof v === "string") {
        a += ` data-s-${k}="${v}"`;
        const ov = spec["$" + mode];
        if (!(ov && typeof ov !== "string" && k in ov) && inR(last, v)) c.push(k);
      }
    }
    return { a, c: c.join(" ") };
  };
  const corners = (x: number, y: number, z: number, w: number, d: number, h: number) => {
    const o: V3[] = [];
    for (const X of [x, x + w])
      for (const Y of [y, y + d]) for (const Z of [z, z + h]) o.push([X, Y, Z]);
    return o;
  };
  const V = pr.V;

  const add = (
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    draw: Draw,
    depth?: number,
  ) => {
    pts.push(...corners(x, y, z, w, d, h));
    items.push({ depth: depth ?? (x + w / 2) * V[0] + (y + d / 2) * V[1] + z * 0.01, draw });
  };
  const label = (p: V3, l: Lab) => {
    if (!l.fixed && cam.lab?.[l.t]) l = { ...l, a: cam.lab[l.t] };
    const ng = cam.nudge?.[l.t];
    if (ng) {
      const [du2, dv2, dz = 0] = ng;
      const [x2, y2] = map(du2, dv2);
      p = [p[0] + x2, p[1] + y2, p[2] + dz];
    }
    if (ph && !/\b(acc|err|keep)\b/.test(l.cls ?? "")) l = { ...l, s: null };
    labels.push({ ...l, p });
  };
  // label at the box's extreme screen point: n (top), s (bottom), e (right), w (left); ties are averaged.
  const lab = (b: Box, l: Lab) => {
    const a = cam.lab?.[l.t] ?? (ph ? (l.pa ?? "e") : (l.a ?? "n"));
    let p: V3;
    if (a === "c") p = [b.cx, b.cy, b.z + b.h];
    else {
      const cs = corners(b.x, b.y, b.z, b.w, b.d, b.h).map((c): [V3, V2] => [c, pr.D(...c)]);
      const key = ([, [sx, sy]]: [V3, V2]) =>
        a === "n" ? -sy : a === "s" ? sy : a === "e" ? sx : -sx;
      const best = Math.max(...cs.map(key));
      const tie = cs.filter((c) => key(c) > best - 0.5);
      const avg = (i: 0 | 1 | 2) => tie.reduce((t, [c]) => t + c[i], 0) / tie.length;
      p = [avg(0), avg(1), avg(2)];
    }
    label(p, { ...l, a, fixed: true });
  };
  const put = (
    u: number,
    v: number,
    w: number,
    d: number,
    h: number,
    draw: PutDraw,
    o: { z?: number; depth?: number; lab?: Lab } = {},
  ): Box => {
    const [cx, cy] = map(u, v);
    const x = cx - w / 2,
      y = cy - d / 2,
      z = o.z ?? Z0;
    add(x, y, z, w, d, h, (K) => draw(K, x, y, z), o.depth);
    const box = { x, y, z, w, d, h, cx, cy, u, v };
    if (o.lab) lab(box, o.lab);
    return box;
  };
  const wire = (p3: V3[], spec: Spec) => wires.push({ p3, spec });
  const pulse = (p3: V3[], spec: Spec) => pulses.push({ p3, spec });
  // a wire in flow space (z fixed) with an optional spark
  const link = (uv: V2[], hot: Spec | false = {}, go: Spec | null = null, z = Z0) => {
    const p3 = uv.map(([u, v]): V3 => [...map(u, v), z]);
    if (hot !== false) wire(p3, hot);
    if (go) pulse(p3, go);
    return p3;
  };

  const render = (aspect: number, margin = 0.06, stageW?: number) => {
    const ex = (l: Lab, w: number, h: number, g: number, p: V3): Extra[] => {
      if (l.a === "e")
        return [
          [p, w + g, -h / 2],
          [p, w + g, h / 2],
        ];
      if (l.a === "w")
        return [
          [p, -w - g, -h / 2],
          [p, -w - g, h / 2],
        ];
      if (l.a === "n")
        return [
          [p, -w / 2, -h - g],
          [p, w / 2, -h - g],
        ];
      if (l.a === "s")
        return [
          [p, -w / 2, h + g],
          [p, w / 2, h + g],
        ];
      return [
        [p, -w / 2, -h / 2],
        [p, w / 2, h / 2],
      ];
    };
    const lpOf = (sc: number): Extra[] =>
      labels.flatMap((l) => {
        if (l.cls && /\bhide\b/.test(l.cls)) return [];
        const row = (l.cls ?? "").includes("row"),
          T = l.t.length,
          U = (l.s ?? "").length;
        const ch = row ? T + U + 1 : Math.max(T, U);
        const raw = ch * 8.4 + 26,
          cap = ph ? 136 : 1e9;
        const lines =
          Math.ceil(raw / cap) * (l.s && !row && (!ph || /acc|err|keep/.test(l.cls ?? "")) ? 2 : 1);
        const w = (Math.min(raw, cap) / sc) * (ph && l.a === "w" ? 1.12 : 1),
          h = (lines * 16 + 10) / sc,
          g = 8 / sc;
        const [ox, oy] = cam.sn?.[l.t] ?? [0, 0];
        return ex(l, w, h, g, l.p).map(([q, dx, dy]): Extra => [q, dx + ox / sc, dy + oy / sc]);
      });
    // the plate: a rectangle in flow space under everything
    const fl = pts.map((p) => unmap(p[0], p[1])),
      us = fl.map((q) => q[0]),
      vs = fl.map((q) => q[1]);
    const pad = cfg.plate ?? 40,
      pv = pad * (ph ? 0.8 : 1);
    const u0 = Math.min(...us) - pad,
      u1 = Math.max(...us) + pad,
      v0 = Math.min(...vs) - pv,
      v1 = Math.max(...vs) + pv;
    const at = (u: number, v: number, z: number): V3 => [...map(u, v), z];
    const ground = cam.ground ?? "slab";
    const gp: V3[] =
      ground === "none"
        ? []
        : (
            [
              [u0, v0],
              [u0, v1],
              [u1, v0],
              [u1, v1],
            ] as V2[]
          ).flatMap(([u, v]) => [at(u, v, 0), at(u, v, Z0)]);
    let fpts: V3[] = [...pts, ...gp];
    if (cam.crop) {
      const [a0, a1, b0, b1, zt = 60] = cam.crop;
      fpts = (
        [
          [a0, b0],
          [a0, b1],
          [a1, b0],
          [a1, b1],
        ] as V2[]
      ).flatMap(([u, v]) => [at(u, v, Z0), at(u, v, zt)]);
    }
    const sw = stageW ?? (ph ? 330 : 740);
    let K = frame(fpts, margin, aspect, cam);
    for (let it = 0; it < 3; it++) K = frame(fpts, margin, aspect, cam, lpOf(sw / K.W));
    const q = (pp: V3[]) => K.path([...pp, ...pp.slice(0, 1)]);
    const i = 9;
    const ring: V2[] = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    let svg = "";
    if (ground === "slab") {
      const sc = (
        [
          [u0 + 14, v0 + 14],
          [u0 + 14, v1 - 14],
          [u1 - 14, v0 + 14],
          [u1 - 14, v1 - 14],
        ] as V2[]
      )
        .map(([u, v]) => {
          const [x, y] = K.P(...at(u, v, Z0));
          return `<ellipse class="screw" cx="${r1(x)}" cy="${r1(y)}" rx="3.2" ry="${r1(Math.max(0.8, 3.3 * K.sp))}"/>`;
        })
        .join("");
      // the slab's visible sides: edges whose outward normal faces the camera
      const cu = (u0 + u1) / 2,
        cv = (v0 + v1) / 2,
        [ccx, ccy] = map(cu, cv);
      let sides = "";
      for (let e = 0; e < 4; e++) {
        const ra = ring[e] ?? [0, 0],
          rb = ring[(e + 1) % 4] ?? [0, 0];
        const a = map(...ra),
          b = map(...rb),
          mx = (a[0] + b[0]) / 2 - ccx,
          my = (a[1] + b[1]) / 2 - ccy;
        if (mx * V[0] + my * V[1] > 1e-3)
          sides += `<path class="face" d="${q([
            [...a, Z0],
            [...b, Z0],
            [...b, 0],
            [...a, 0],
          ])}"/>`;
      }
      svg = `<g class="ground">${sides}<path class="face top" d="${q(ring.map(([u, v]) => at(u, v, Z0)))}"/><path class="detail" d="${q(
        [
          at(u0 + i, v0 + i, Z0),
          at(u1 - i, v0 + i, Z0),
          at(u1 - i, v1 - i, Z0),
          at(u0 + i, v1 - i, Z0),
        ],
      )}"/>${sc}</g>`;
    } else if (ground === "grid") {
      // a blueprint floor: no slab, a fine grid in flow space and a dashed edge
      const step = cam.gridStep ?? 40;
      let g = "";
      for (let u = Math.ceil(u0 / step) * step; u <= u1; u += step)
        g += `<path class="gridl" d="${K.path([at(u, v0, Z0), at(u, v1, Z0)])}"/>`;
      for (let v = Math.ceil(v0 / step) * step; v <= v1; v += step)
        g += `<path class="gridl" d="${K.path([at(u0, v, Z0), at(u1, v, Z0)])}"/>`;
      svg = `<g class="ground grid">${g}<path class="dash" d="${q(ring.map(([u, v]) => at(u, v, Z0)))}"/></g>`;
    } else if (ground === "outline") {
      svg = `<g class="ground"><path class="dash" d="${q(ring.map(([u, v]) => at(u, v, Z0)))}"/></g>`;
    }
    svg += floor.map((f) => f(K)).join("");
    for (const w of wires) {
      const s = st(w.spec),
        d = K.path(w.p3);
      svg += `<path class="wire-under" d="${d}"/><path class="wire ${s.c}"${s.a} d="${d}"/>`;
    }
    items.sort((a, b) => a.depth - b.depth);
    svg += items.map((it) => `<g class="it">${it.draw(K)}</g>`).join("");
    // sparks: one dot per pulse path; plates.ts moves it through the projected corner points
    // (transform only). The classes are not baked: a spark is only ever seen while it runs.
    for (const p of pulses) {
      const s = st(p.spec);
      const dp = p.p3.map((v) => K.P(...v).join(",")).join(" ");
      svg += `<circle class="spark" r="3" cx="0" cy="0"${s.a} data-pts="${dp}"/>`;
    }
    const html = labels
      .map((l) => {
        let [x, y] = K.P(...l.p);
        const s = st(l.spec),
          [ox, oy] = cam.sn?.[l.t] ?? [0, 0];
        if (stageW) {
          x += (ox * K.W) / stageW;
          y += (oy * K.W) / stageW;
        }
        const tag = l.tip ? "button" : "span";
        const atr = l.tip
          ? ` type="button"${l.k ? ` data-k="${l.k}"` : ""} data-tip="${esc(l.tip)}" aria-expanded="false"`
          : "";
        return `<${tag} class="lb a-${l.a ?? "n"} ${l.cls ?? ""} ${s.c}"${s.a}${atr} style="left:${r1((x / K.W) * 100)}%;top:${r1((y / K.H) * 100)}%"><b>${esc(l.t)}</b>${l.s ? `<i>${esc(l.s)}</i>` : ""}</${tag}>`;
      })
      .join("");
    return {
      K,
      svg,
      html,
      crop: !!cam.crop,
      labels: labels.map((l) => ({ t: l.t, s: l.s ?? null, on: !/\boff\b/.test(st(l.spec).c) })),
    };
  };

  return {
    ph,
    map,
    unmap,
    st,
    mode,
    n,
    cam,
    V,
    add,
    put,
    floor: (draw: Draw) => floor.push(draw),
    wire,
    pulse,
    link,
    label,
    lab,
    pts,
    render,
  };
}

export type SceneT = ReturnType<typeof Scene>;

/** One Highlights figure: geometry + cameras. Copy for the plate lives in data.ts (`plate`). */
export interface PlateScene {
  draw: (ph: boolean, cam: Cam) => SceneT;
  cam: { dk: Cam; ph: Cam };
  asp: [number, number];
  /** "docs": the OCR template's Invoice / Receipt / Timesheet buttons. */
  ctrl?: "docs";
}

export const G = (S: SceneT, spec: Spec, cls: string, inner: string, k?: string) => {
  const s = S.st(spec);
  return `<g class="${cls} ${s.c}"${s.a}${k ? ` data-k="${k}"` : ""}>${inner}</g>`;
};
export const prn = (S: SceneT, t: string, x = 6, y = 13, size = 11) =>
  S.ph ? "" : `<text class="prn" x="${x}" y="${y}" font-size="${size}">${esc(t)}</text>`;

/** A desktop/phone pick, typed so tuples stay tuples. */
export const P = <T>(ph: boolean, dk: T, pp: T): T => (ph ? pp : dk);
