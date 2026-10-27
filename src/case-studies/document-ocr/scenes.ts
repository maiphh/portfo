/*
 * Highlights scenes for Document OCR (template, queue, api). Port of the prototype's build/projects/ocr.mjs
 * (dive scenes only) with the cameras from build/views.mjs. Labels and tips are copy: they sit next to the
 * geometry they are anchored to, and every string is listed in HIGHLIGHTS-SPEC Appendix A.
 * Drawn at build time with the iso-glow kernel (MIT, see src/lib/iso/LICENSE-iso-glow).
 */
import { O } from "~/lib/iso/objects";
import { G, P, Scene, Z0, r1, slits, type Cam, type PlateScene, type V2 } from "~/lib/iso/scene";

// ---- 1 · template: four layers, three made-up document types, one pipeline ----
type R4 = [number, number, number, number];
export const DOC_TYPES = ["invoice", "receipt", "timesheet"] as const;
const DOCS: Record<(typeof DOC_TYPES)[number], R4[]> = {
  invoice: [
    [8, 8, 46, 12],
    [62, 8, 40, 12],
    [8, 30, 70, 12],
    [56, 58, 46, 14],
  ],
  receipt: [
    [20, 6, 70, 12],
    [8, 26, 40, 10],
    [8, 44, 52, 10],
    [54, 62, 48, 12],
  ],
  timesheet: [
    [8, 8, 60, 12],
    [8, 28, 94, 10],
    [8, 46, 30, 22],
    [44, 58, 58, 12],
  ],
};
const LAYERS: [string, string][] = [
  ["workbook", "The Excel layout those values fill."],
  ["rules", "The rules that clean the values."],
  ["prompts", "The instructions for the model."],
  ["schema", "The fields to read."],
];
function template(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { d: 6 }, mode: "d", plate: 36 });
  const W = 170,
    D = 140,
    gap = ph ? 40 : 34,
    th = 9;
  const SU = P(ph, 280, 290);
  const [sx, sy] = S.map(SU, 0),
    bx = sx - W / 2,
    by = sy - D / 2;
  DOC_TYPES.forEach((k, i) => {
    const [du, dv] = P<V2>(ph, [30, (i - 1) * 95 + 30], [i * 84 - 190, -62]);
    const sel = i === 0;
    S.put(
      du,
      dv,
      58,
      70,
      14,
      (K, x, y, z) =>
        G(S, {}, "obj", O.sheets(K, x + 3, y + 3, z, 52, 64, 3), "doc") +
        G(
          S,
          sel ? { hot: "0-" } : {},
          `lt doc-${k}`,
          K.boxc(x + 44, y + 58, z + 13, 8, 6, 3, 0, ""),
        ),
      { lab: { a: "w", pa: "e", t: k, cls: `dlb dlb-${k}${sel ? " sel" : ""}` } },
    );
    if (!ph)
      S.link(
        [
          [du + 31, dv],
          [140, dv],
          [140, 0],
          [SU - W / 2 - 14, 0],
        ],
        sel ? { hot: "0-" } : {},
        sel ? { go: "0" } : null,
      );
    else
      S.link(
        [
          [du, dv + 36],
          [du, 0],
        ],
        sel ? { hot: "0-" } : {},
        null,
      );
  });
  if (ph)
    S.link(
      [
        [-190, 0],
        [SU - D / 2 - 40, 0],
      ],
      { hot: "0-" },
      { go: "0" },
    );
  S.floor(
    (K) =>
      `<g transform="${K.TOP(bx - 10, by - 10, Z0)}"><rect class="dash" width="${W + 20}" height="${D + 20}" rx="6"/></g>`,
  );
  LAYERS.forEach(([name, tip], i) => {
    const z = Z0 + 12 + i * gap,
      top = i === 3;
    S.add(
      bx,
      by,
      z,
      W,
      D,
      th,
      (K) => {
        let g = `<g transform="${K.SIDE(bx + W, by + D, z + th)}">${slits(12, D - 12, 10, 2, th - 2, true)}</g>`;
        if (top) {
          // one pre-drawn set of field boxes per document type; plates.ts cross-fades them (opacity only)
          const sc = 1.4,
            o = [12, 12] as const;
          const rect = (b: R4) =>
            `<rect class="fbox" x="${r1(o[0] + b[0] * sc)}" y="${r1(o[1] + b[1] * sc)}" width="${r1(b[2] * sc)}" height="${r1(b[3] * sc)}" rx="2"/>`;
          g += `<g transform="${K.TOP(bx, by, z + th)}">${DOC_TYPES.map(
            (d, j) =>
              `<g class="fbox-set" data-set="${d}"${j ? ` style="opacity:0;visibility:hidden"` : ""}>${DOCS[d].map(rect).join("")}</g>`,
          ).join("")}</g>`;
        } else
          g += `<g transform="${K.TOP(bx, by, z + th)}">${slits(20, W - 20, 14, 14, D - 14, true)}</g>`;
        return G(
          S,
          { ln: `${4 - i}-` },
          "ln-g layer",
          K.box(bx, by, z, W, D, th, 8) + g,
          "l" + name,
        );
      },
      1000 + i,
    );
    S.label([bx + W, by, z + th / 2], {
      a: "e",
      t: name,
      k: "l" + name,
      tip,
      spec: { off: `0-${3 - i}` },
    });
  });
  // the lock: each run keeps its template
  const lz = Z0 + 12 + 3 * gap + th;
  S.add(
    bx + 16,
    by + D - 46,
    lz,
    34,
    30,
    16,
    (K) =>
      G(
        S,
        { hot: "5-", off: "0-4" },
        "lt lock",
        K.box(bx + 16, by + D - 46, lz, 34, 30, 16, 3) +
          `<g transform="${K.TOP(bx + 16, by + D - 46, lz + 16)}"><path class="shackle" d="M10 15 v-6 a7 7 0 0 1 14 0 v6"/></g>`,
        "lock",
      ),
    2000,
  );
  S.label([bx + 33, by + D - 31, lz + 16], {
    a: "n",
    t: "run keeps its template",
    cls: "acc",
    k: "lock",
    tip: "Each run keeps the template it started with. Editing that template later does not change a job that is already in progress.",
    spec: { off: "0-4" },
  });
  // one pipeline for every template
  const PU = P(ph, 480, 470);
  S.link(
    [
      [SU + W / 2 + 4, 0],
      [PU - 40, 0],
    ],
    { hot: "5-" },
    { go: "5" },
  );
  S.put(
    PU,
    0,
    64,
    84,
    52,
    (K, x, y, z) =>
      G(
        S,
        { ln: "5-" },
        "ln-g",
        O.rack(
          K,
          x,
          y,
          z,
          64,
          84,
          52,
          `<rect class="led" x="${64 - 14}" y="4" width="5" height="3"/>`,
        ),
        "pipe",
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "one pipeline",
        k: "pipe",
        tip: "Adding a document type does not require a code change. The same pipeline runs every template.",
      },
    },
  );
  return S;
}

// ---- 2 · queue: render keeps going while extraction takes turns ----
const RR = "ABCABC",
  FIFO = "AAAAAA";
function queue(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { rr: 6, fifo: 6 }, mode: "rr", plate: 34 });
  const docs: [string, string][] = [
    ["A", "long PDF"],
    ["B", ""],
    ["C", ""],
  ];
  const U = P(
    ph,
    { doc: 0, ren: 150, rq: 270, sl: 420, mod: 590 },
    { doc: 0, ren: 170, rq: 280, sl: 360, mod: 520 },
  );
  docs.forEach(([k, s], i) => {
    const v = (i - 1) * (ph ? 74 : 86),
      n = k === "A" ? 5 : 2;
    S.put(
      U.doc,
      v,
      50,
      60,
      8 + n * 5,
      (K, x, y, z) =>
        G(S, {}, "obj", O.sheets(K, x + 2 + n * 3, y + 2 + n * 3, z, 44, 54, n), "d" + k),
      {
        lab: {
          a: "n",
          pa: "n",
          t: k,
          s: s || null,
          cls: "mono",
          k: "d" + k,
          tip:
            k === "A"
              ? "A long PDF: many pages to extract."
              : "A short document arriving while A is still in flight.",
        },
      },
    );
    S.link(
      [
        [U.doc + 30, v],
        [U.ren - 60, v],
        [U.ren - 60, 0],
        [U.ren - 36, 0],
      ],
      { hot: "0-" },
      i === 0 ? { go: "0-" } : null,
    );
  });
  if (ph) S.put(-80, 0, 1, 1, 0, () => "");
  // render rack (CPU)
  S.put(
    U.ren,
    0,
    66,
    76,
    48,
    (K, x, y, z) =>
      G(
        S,
        { hot: "0-" },
        "ln-g",
        O.rack(
          K,
          x,
          y,
          z,
          66,
          76,
          48,
          G(S, { hot: "0-" }, "led", `<rect x="50" y="4" width="5" height="3"/>`),
        ),
        "ren",
      ),
    {
      lab: {
        a: "n",
        t: "render queue",
        s: "PDF → page images",
        cls: "keep",
        k: "ren",
        tip: "Turning a PDF into page images is quick. Render keeps using the CPU while extraction waits on the model.",
      },
    },
  );
  S.link(
    [
      [U.ren + 36, 0],
      [U.sl - 70, 0],
    ],
    { hot: "0-" },
    { go: "1-" },
  );
  // extract queue: six slots, each claimed by a document
  const cols = 2,
    rows = 3,
    cs = 38,
    gp = 8,
    gw = cols * cs + (cols + 1) * gp,
    gd = rows * cs + (rows + 1) * gp;
  const [ex, ey] = S.map(U.sl, 0);
  S.add(
    ex - gw / 2,
    ey - gd / 2,
    Z0,
    gw,
    gd,
    6,
    (K) => G(S, {}, "obj", K.box(ex - gw / 2, ey - gd / 2, Z0, gw, gd, 6, 4), "ext"),
    900,
  );
  for (let s = 0; s < 6; s++) {
    const i = s % cols,
      j = Math.floor(s / cols);
    const x = ex - gw / 2 + gp + i * (cs + gp),
      y = ey - gd / 2 + gp + j * (cs + gp);
    S.add(
      x,
      y,
      Z0 + 6,
      cs,
      cs,
      6,
      (K) => G(S, { hot: `${s >= 3 ? 4 : 3}-` }, "lt", K.box(x, y, Z0 + 6, cs, cs, 6, 3), "ext"),
      1000 + s,
    );
    for (const [m, seq] of [
      ["rr", RR],
      ["fifo", FIFO],
    ] as const)
      S.label([x + cs / 2, y + cs / 2, Z0 + 12], {
        a: "c",
        t: seq.charAt(s),
        cls: `slotlb m-${m}`,
        spec: { off: `0-${s >= 3 ? 3 : 2}` },
      });
  }
  S.label(ph ? [ex + gw / 2, ey - gd / 2, Z0 + 6] : [ex - gw / 2, ey + gd / 2, Z0 - 14], {
    a: ph ? "e" : "s",
    t: "extract queue",
    s: "slots take turns",
    cls: "keep",
    k: "ext",
    tip: "A round-robin claim picks the job with the least work already running, so one long PDF cannot take every slot.",
  });
  S.link(
    [
      [U.sl + gd / 2 + 4, 0],
      [U.mod - 44, 0],
    ],
    { hot: "5-" },
    { go: "5" },
  );
  S.put(U.mod, 0, 80, 80, 20, (K, x, y, z) => O.chip(S, K, x, y, z, 80, { hot: "5-" }, "mod"), {
    lab: {
      a: "s",
      pa: "e",
      t: "model",
      s: "the slow step",
      cls: "keep",
      k: "mod",
      tip: "Waiting on the model is the bottleneck.",
    },
  });
  S.floor((K) => {
    const [x, y] = S.map(U.mod, 0);
    return G(
      S,
      { hot: "5-" },
      "halo",
      `<g transform="${K.TOP(x - 70, y - 70, Z0)}"><ellipse cx="70" cy="70" rx="64" ry="64"/></g>`,
    );
  });
  return S;
}

// ---- 3 · api: a key per system, the same queues, the workbook back ----
function api(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { d: 5 }, mode: "d", plate: 34 });
  const U = P(ph, { a: 0, b: 175, c: 345, d: 510 }, { a: 0, b: 170, c: 330, d: 480 });
  S.put(
    U.a,
    0,
    56,
    50,
    40,
    (K, x, y, z) =>
      G(
        S,
        { ln: "2-" },
        "ln-g scr-g",
        K.box(x + 12, y + 18, z, 32, 14, 4) +
          K.box(x, y + 20, z + 4, 56, 6, 36) +
          `<g transform="${K.FRONT(x, y + 26, z + 40)}"><rect class="glass" x="4" y="4" width="48" height="28" rx="1.5"/></g>`,
        "sys",
      ),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "other system",
        k: "sys",
        tip: "The browser is not the only way in. Other applications can send documents and receive the workbook.",
      },
    },
  );
  S.link(
    [
      [U.a + 32, 6],
      [U.b - 44, 6],
    ],
    { hot: "2-" },
    { go: "2" },
  );
  S.link(
    [
      [U.b - 44, -14],
      [U.a + 32, -14],
    ],
    { hot: "4-" },
    { go: "4" },
  );
  // API: a server with the key on top
  S.put(
    U.b,
    0,
    76,
    76,
    36,
    (K, x, y, z) =>
      G(S, { ln: "0-" }, "ln-g", O.rack(K, x, y, z, 76, 76, 36), "apik") +
      G(S, { hot: "0", ln: "1-" }, "lt key", O.key(K, x + 12, y + 30, z + 36), "apik"),
    {
      lab: {
        a: "n",
        t: "API key",
        s: "shown once · hash stored",
        cls: "keep",
        k: "apik",
        tip: "An admin creates a key for each system. The key is shown once, only a hash is stored, and the key acts as the user it belongs to.",
      },
    },
  );
  S.link(
    [
      [U.b + 40, 0],
      [U.c - 60, 0],
    ],
    { hot: "3-" },
    { go: "3" },
  );
  // the same two queues as the UI
  [-34, 34].forEach((v, i) =>
    S.put(
      U.c,
      v,
      96,
      52,
      14,
      (K, x, y, z) =>
        G(
          S,
          { ln: "3-" },
          "ln-g",
          K.box(x, y, z, 96, 52, 8, 4) +
            [0, 1, 2].map((j) => K.box(x + 10 + j * 28, y + 12, z + 8, 20, 28, 6, 2)).join(""),
          "q",
        ),
      i !== (ph ? 1 : 0)
        ? {}
        : {
            lab: {
              a: "n",
              pa: "e",
              t: "same queues",
              k: "q",
              tip: "The job uses the same queues as a job started in the UI.",
            },
          },
    ),
  );
  S.link(
    [
      [U.c + 52, 0],
      [U.d - 70, 0],
    ],
    { hot: "4-" },
    { go: "4" },
  );
  S.put(
    U.d,
    0,
    120,
    132,
    10,
    (K, x, y, z) =>
      G(
        S,
        { ln: "4-" },
        "ln-g",
        O.grid(S, K, x, y, z, 120, 132, 10, 3, 4, (_i, j) => (j < 3 ? { hot: "4-" } : null)),
        "xl",
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "fields + Excel",
        k: "xl",
        tip: "A caller sends files and a template, and gets back the extracted fields and the filled Excel file.",
      },
    },
  );
  return S;
}

const ASP: [number, number] = [1.45, 0.62];
export const SCENES: Record<string, PlateScene> = {
  template: {
    draw: template,
    asp: ASP,
    ctrl: "docs",
    cam: {
      dk: { yaw: 10, el: 22, flow: "scr", ground: "outline" },
      ph: {
        yaw: 58,
        el: 26,
        sn: {
          schema: [0, -10],
          prompts: [0, -4],
          rules: [0, 2],
          workbook: [0, 8],
          "run keeps its template": [0, 6],
        },
      },
    },
  },
  queue: {
    draw: queue,
    asp: ASP,
    cam: {
      dk: { yaw: 10, el: 74, flow: "scr", ground: "grid" },
      ph: { yaw: 0, el: 74, ground: "grid" },
    },
  },
  api: {
    draw: api,
    asp: ASP,
    cam: {
      dk: { yaw: 66, el: 30, flow: "up", sn: { "same queues": [0, -16] } },
      ph: { yaw: 64, el: 34 },
    },
  },
};
