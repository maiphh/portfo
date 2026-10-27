/*
 * Highlights scenes for the Data Validation Platform (validate, translate, sandbox). Port of the prototype's
 * build/projects/dvp.mjs (dive scenes only) with the cameras from build/views.mjs. Made-up rows only.
 * Labels and tips are copy (HIGHLIGHTS-SPEC Appendix A + docs/highlights-copy-decisions: "structure changed").
 * iso-glow kernel: MIT, see src/lib/iso/LICENSE-iso-glow.
 */
import { O } from "~/lib/iso/objects";
import {
  G,
  P,
  Scene,
  Z0,
  slits,
  type Cam,
  type Kernel,
  type PlateScene,
  type SceneT,
  type Spec,
  type V2,
  type V3,
} from "~/lib/iso/scene";

const fn = (
  S: SceneT,
  K: Kernel,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  spec: Spec,
  k: string,
) =>
  G(
    S,
    spec,
    "ln-g",
    K.box(x, y, z, w, d, h, 4) +
      `<g transform="${K.TOP(x, y, z + h)}">${slits(8, d - 8, 8, 8, w - 8, false, "detail strong")}</g>`,
    k,
  );
/** Modules a rule may use (projects/dvp/highlights.md); also the sandbox chips in data.ts. */
export const MODS = ["re", "math", "datetime", "decimal", "statistics", "collections"] as const;

// ---- validate: this month's files against the saved structure ----
function validate(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { match: 4, mismatch: 4 }, mode: "mismatch", plate: 34 });
  const U = P(ph, { f: 0, g: 170, run: 330 }, { f: 0, g: 165, run: 350 });
  S.put(
    U.f,
    0,
    112,
    120,
    10,
    (K, x, y, z) =>
      G(
        S,
        { ln: "0-" },
        "ln-g",
        O.grid(S, K, x, y, z, 112, 120, 10, 4, 4, (i, j) =>
          j === 0
            ? i === 2
              ? { hot: "1-", $mismatch: { er: "2-", hot: "1" } }
              : { hot: "1-" }
            : null,
        ),
        "file",
      ),
    {
      lab: {
        a: "n",
        pa: "n",
        t: "this month’s file",
        k: "file",
        tip: "The uploaded files for the pay month.",
      },
    },
  );
  S.label([...S.map(U.f + 28, 10), Z0 + 12], {
    a: "e",
    t: "structure changed",
    cls: "err",
    spec: { off: "0-", $mismatch: { off: "0-1" } },
    tip: "A sheet, a column or a field that no longer matches what initialization learned.",
  });
  // saved structure, beside the gate
  const sv = P(ph, -120, -70);
  const sw = P(ph, 70, 50),
    sd = P(ph, 56, 50);
  S.put(
    U.g,
    sv,
    sw,
    sd,
    18,
    (K, x, y, z) => G(S, { ln: "0-" }, "ln-g", O.rack(K, x, y, z, sw, sd, 18), "saved"),
    {
      lab: {
        a: "n",
        pa: "w",
        t: "saved structure",
        k: "saved",
        tip: "The sheet structure stored for this client at initialization.",
      },
    },
  );
  S.link(
    [
      [U.g, sv + 30],
      [U.g, -40],
    ],
    { hot: "1-" },
    { go: "1" },
  );
  S.link(
    [
      [U.f + 58, 0],
      [U.g - 6, 0],
    ],
    { hot: "1-" },
    { go: "1" },
  );
  S.put(
    U.g,
    0,
    10,
    84,
    44,
    (K, x, y, z) =>
      O.gate(S, K, x, y, z, 84, 44, { hot: "2", $mismatch: { er: "2-", hot: "" } }, "cmp"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "structure check",
        k: "cmp",
        tip: "Before a pay month runs, the files are compared with the saved structure.",
      },
    },
  );
  S.link(
    [
      [U.g + 6, 0],
      [U.run - 40, 0],
    ],
    { hot: "3-", $mismatch: { off: "0-" } },
    { go: "3", $mismatch: {} },
  );
  S.put(
    U.run,
    0,
    70,
    80,
    44,
    (K, x, y, z) =>
      G(
        S,
        { ln: "3-", $mismatch: { dim: "2-" } },
        "ln-g",
        O.rack(
          K,
          x,
          y,
          z,
          70,
          80,
          44,
          G(S, { hot: "3-" }, "ledg", `<rect class="led" x="54" y="4" width="6" height="3"/>`),
        ),
        "run",
      ),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "the month runs",
        cls: "acc",
        k: "run",
        spec: { off: "0-2", $mismatch: { off: "0-" } },
      },
    },
  );
  // the mapping task (mismatch only)
  const mv = P(ph, 110, 60);
  S.link(
    ph
      ? [
          [U.g + 6, 20],
          [U.g + 80, 20],
          [U.g + 80, mv - 8],
        ]
      : [
          [U.g, 40],
          [U.g, mv - 30],
        ],
    { off: "0-", $mismatch: { hot: "3-", off: "0-2" } },
    { $mismatch: { go: "3" } },
  );
  S.put(
    P(ph, U.g, U.g + 80),
    mv,
    60,
    10,
    44,
    (K, x, y, z) =>
      G(
        S,
        { off: "0-", $mismatch: { ln: "3-", off: "0-2" } },
        "ln-g",
        O.card(K, x, y, z, 60, 36, 3),
        "map",
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "map the file",
        cls: "acc",
        k: "map",
        spec: { off: "0-", $mismatch: { off: "0-2" } },
        tip: "The user is asked to map the file. The month does not run on a layout the client was not taught.",
      },
    },
  );
  return S;
}

// ---- translate: try, check, retry with the error, or stub that one rule ----
function translate(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { ok: 5, never: 6 }, mode: "never", plate: 34 });
  const U = P(
    ph,
    { r: 0, ai: 135, tr: 135, fn: 255, ck: 360, out: 470, oth: 470 },
    { r: 0, ai: 115, tr: 185, fn: 270, ck: 360, out: 450, oth: 545 },
  );
  const tv = P(ph, 64, 0),
    ov = P(ph, 96, 0);
  S.put(
    U.r,
    0,
    56,
    70,
    14,
    (K, x, y, z) => G(S, { ln: "0-" }, "ln-g", O.sheets(K, x + 3, y + 3, z, 50, 64, 3), "rule"),
    {
      lab: { a: "s", pa: "e", t: "one rule", k: "rule" },
    },
  );
  S.link(
    [
      [U.r + 32, 0],
      [U.ai - 32, 0],
    ],
    { hot: "1-" },
    { go: "1" },
  );
  S.put(
    U.ai,
    0,
    60,
    60,
    20,
    (K, x, y, z) =>
      O.chip(S, K, x, y, z, 60, { hot: "1,3", ln: "0-", $never: { hot: "1-2" } }, "ai"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "translator",
        k: "ai",
        tip: "Each plain-language rule is translated into one Python function.",
      },
    },
  );
  // the five tries: a row in front of the translator (desktop) or under it (phone)
  for (let i = 0; i < 5; i++)
    S.put(
      ph ? U.tr : U.tr - 48 + i * 24,
      ph ? -48 + i * 24 : tv,
      18,
      18,
      8,
      (K, x, y, z) =>
        G(
          S,
          {
            er: i === 0 ? "2-" : "",
            hot: i === 1 ? "3-" : "",
            $never: { er: i === 0 ? "1-" : i === 1 ? "2-" : "3-", hot: "" },
          },
          "lt",
          K.box(x, y, z, 18, 18, 7, 3),
          "try",
        ),
      i === 4
        ? {
            lab: {
              a: "s",
              pa: "e",
              t: "5 tries · 180 s",
              cls: "keep",
              k: "try",
              tip: "Attempts and time are capped: 5 tries inside 180 seconds.",
            },
          }
        : {},
    );
  S.link(
    [
      [U.ai + 32, 0],
      [U.fn - 34, 0],
    ],
    { hot: "1-", $never: { hot: "1-3" } },
    { go: "1,3", $never: { go: "1-2" } },
  );
  S.put(
    U.fn,
    0,
    64,
    52,
    22,
    (K, x, y, z) => fn(S, K, x, y, z, 64, 52, 22, { ln: "1-", $never: { ln: "1-3" } }, "fn"),
    {
      lab: { a: "s", pa: "e", t: "one function", k: "fn" },
    },
  );
  S.link(
    [
      [U.fn + 34, 0],
      [U.ck - 6, 0],
    ],
    { hot: "2-", $never: { hot: "1-3" } },
    { go: "2,4", $never: { go: "1-2" } },
  );
  S.put(
    U.ck,
    0,
    10,
    80,
    42,
    (K, x, y, z) =>
      O.gate(S, K, x, y, z, 80, 42, { er: "2", hot: "4-", $never: { er: "1-3", hot: "" } }, "ck"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "checked",
        k: "ck",
        tip: "The generated function is run as a check before it is kept.",
      },
    },
  );
  // retry loop: back to the translator with the previous code and the error
  const lv = P(ph, -100, -70);
  S.link(
    [
      [U.ck, -40],
      [U.ck, lv],
      [U.ai, lv],
      [U.ai, -32],
    ],
    { hot: "2-3", $never: { hot: "1-3" } },
    { go: "2", $never: { go: "1-2" } },
  );
  S.label([...S.map((U.ck + U.ai) / 2 + P(ph, 0, 20), lv), Z0], {
    a: P(ph, "n", "w"),
    t: "retry with code + error",
    cls: "acc",
    spec: { off: "0-1", $never: { off: "0" } },
    tip: "Translation tries again with the previous code and the error, instead of starting from a blank prompt.",
  });
  S.link(
    [
      [U.ck + 6, 0],
      [U.out - 34, 0],
    ],
    { hot: "4-", $never: { hot: "4-" } },
    { go: "4", $never: { go: "4" } },
  );
  S.put(
    U.out,
    0,
    64,
    52,
    22,
    (K, x, y, z) =>
      fn(S, K, x, y, z, 64, 52, 22, { ln: "4-", $never: { ln: "" } }, "kept") +
      G(S, { off: "0-", $never: { off: "0-3" } }, "ghost", K.box(x - 2, y - 2, z, 68, 56, 26, 4)),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "function kept",
        cls: "acc",
        k: "kept",
        spec: { off: "0-3", $never: { off: "0-" } },
      },
    },
  );
  S.label([...S.map(U.out + 32, 0), Z0 + P(ph, 13, 32)], {
    a: "e",
    t: "stub",
    s: "returns nothing",
    cls: "err keep",
    k: "kept",
    spec: { off: "0-", $never: { off: "0-3" } },
    tip: "Past the cap, the rule becomes a stub that returns nothing.",
  });
  // other rules keep translating
  if (ph)
    S.link(
      [
        [U.out + 30, 0],
        [U.oth - 24, 0],
      ],
      { off: "0-", $never: { hot: "5-", off: "0-4" } },
    );
  S.put(
    U.oth,
    ov,
    64,
    40,
    14,
    (K, x, y, z) =>
      G(
        S,
        { off: "0-", $never: { ln: "5-", off: "0-4" } },
        "ln-g",
        K.box(x, y, z, 64, 40, 8, 4) + K.box(x + 6, y + 6, z + 8, 52, 28, 6, 3),
        "others",
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "other rules translate",
        cls: "acc",
        k: "others",
        spec: { off: "0-", $never: { off: "0-4" } },
        tip: "A rule that never translates costs that rule, not the whole client.",
      },
    },
  );
  return S;
}

// ---- sandbox: three callers, one sandbox, a fixed set of modules; open / setattr rejected ----
function sandbox(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { d: 4 }, mode: "d", plate: 34 });
  const C = 250,
    Wb = P(ph, 200, 250),
    Db = P(ph, 160, 130);
  const L = P<{ rule: V2; help: V2; mod: V2; ru: number }>(
    ph,
    { rule: [C - 50, -30], help: [C - 50, 45], mod: [C + 40, -40], ru: C + 175 },
    { rule: [C - 70, 0], help: [C + 5, 0], mod: [C + 55, -22], ru: C + 175 },
  );
  [-1, 0, 1].forEach((i) => {
    const [u, v]: V2 = ph ? [0, i * 50] : [0, i * 56];
    S.put(
      u,
      v,
      40,
      30,
      12,
      (K, x, y, z) => G(S, { ln: "0-" }, "ln-g", K.box(x, y, z, 40, 30, 12, 4), "call"),
      i === (ph ? 1 : -1)
        ? {
            lab: {
              a: "n",
              pa: "e",
              t: "three callers",
              s: "calculation · translation check · monthly validation",
              cls: "keep",
              k: "call",
              tip: "Calculation, the check that runs during translation, and the monthly validation all use one sandbox.",
            },
          }
        : {},
    );
    S.link(
      ph
        ? [
            [u + 20, v],
            [L.rule[0] - 50, v],
            [L.rule[0] - 50, 0],
            [L.rule[0] - 32, 0],
          ]
        : [
            [u + 22, v],
            [L.rule[0] - 34, L.rule[1] + v * 0.2],
          ],
      { hot: "0-" },
      { go: "0" },
    );
  });
  const [sx, sy] = S.map(C, 0);
  const corners: V2[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  S.floor(
    (K) =>
      `<path class="dash" d="${K.path([...corners, [-1, -1] as V2].map(([a, b]): V3 => [...S.map(C + (a * Wb) / 2, (b * Db) / 2), Z0]))}"/>`,
  );
  const Hw = S.cam.cutaway;
  if (Hw) {
    // cutaway: the sandbox's two far walls stand as glass, the near walls are cut down to a dashed rim
    const ring = corners.map(([a, b]) => S.map(C + (a * Wb) / 2, (b * Db) / 2));
    S.floor((K) =>
      ring
        .map((a, e) => {
          const b = ring[(e + 1) % 4] ?? a,
            mx = (a[0] + b[0]) / 2 - sx,
            my = (a[1] + b[1]) / 2 - sy;
          return mx * S.V[0] + my * S.V[1] < 0
            ? `<path class="glassw back" d="${K.path([
                [...a, Z0],
                [...b, Z0],
                [...b, Z0 + Hw],
                [...a, Z0 + Hw],
                [...a, Z0],
              ])}"/>`
            : `<path class="dash" d="${K.path([
                [...a, Z0 + Hw],
                [...b, Z0 + Hw],
              ])}"/><path class="dash" d="${K.path([
                [...a, Z0],
                [...a, Z0 + Hw],
              ])}"/>`;
        })
        .join(""),
    );
    S.pts.push(...ring.map(([x, y]): V3 => [x, y, Z0 + Hw]));
  }
  S.label(ph ? [...S.map(C + Wb / 2 - 10, -Db / 2), Z0] : [...S.map(C + Wb / 2, Db / 2), Z0], {
    a: P(ph, "s", "w"),
    t: "one sandbox",
    k: "box",
    tip: "Payroll rows are checked by code that cannot reach the rest of the server.",
  });
  S.put(
    L.rule[0],
    L.rule[1],
    60,
    50,
    22,
    (K, x, y, z) => fn(S, K, x, y, z, 60, 50, 22, { ln: "1-" }, "fn"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "the rule",
        k: "fn",
        tip: "The function has to be the one the translator was asked for.",
      },
    },
  );
  for (let i = 0; i < 6; i++)
    S.put(
      L.mod[0] + (i % 3) * 22,
      L.mod[1] + Math.floor(i / 3) * 22,
      16,
      16,
      6,
      (K, x, y, z) => G(S, { hot: "1-" }, "lt", K.box(x, y, z, 16, 16, 6, 3), "mods"),
      i === (ph ? 5 : 2)
        ? {
            lab: {
              a: "n",
              pa: "e",
              t: "fixed modules",
              k: "mods",
              tip: `Only a fixed set of modules is available: ${MODS.join(", ")}.`,
            },
          }
        : {},
    );
  S.put(
    L.help[0],
    L.help[1],
    40,
    30,
    14,
    (K, x, y, z) => G(S, { off: "0-2" }, "ghost", K.box(x, y, z, 40, 30, 14, 4), "helper"),
    {
      lab: {
        a: "w",
        pa: "e",
        t: "helper",
        s: "never run as the rule",
        cls: "err keep",
        k: "helper",
        spec: { off: "0-2" },
        tip: "A helper written beside the function is never run as the rule.",
      },
    },
  );
  (
    [
      ["open", -34],
      ["setattr", 34],
    ] as const
  ).forEach(([t, v], i) => {
    S.put(
      L.ru,
      v * P(ph, 1, 1.3),
      30,
      30,
      10,
      (K, x, y, z) =>
        G(
          S,
          { er: "2-" },
          "rej",
          K.box(x, y, z, 30, 30, 10, 4) + O.xmark(K, x, y, z + 10, 30),
          "rej",
        ),
      {
        lab: {
          a: "n",
          pa: i ? "e" : "w",
          t,
          cls: "mono err",
          k: "rej",
          spec: { off: "0-1" },
          tip: "A rule cannot import arbitrary code or open files. open and setattr are rejected.",
        },
      },
    );
    S.link(
      [
        [C + Wb / 2 + 8, v * 0.4],
        [L.ru - 18, v * P(ph, 1, 1.3)],
      ],
      { off: "0-1" },
    );
  });
  return S;
}

const ASP: [number, number] = [1.45, 0.62];
export const SCENES: Record<string, PlateScene> = {
  validate: {
    draw: validate,
    asp: ASP,
    cam: {
      dk: { yaw: 24, el: 40, flow: "scr" },
      ph: {
        yaw: 24,
        el: 40,
        // phone: lift "structure changed" clear of the gate's own label
        sn: {
          "this month’s file": [-50, -4],
          "structure changed": [0, -36],
          "map the file": [-8, 5],
          // keep clear of the left frame edge at 320px (CI fonts run a few px wider)
          "saved structure": [12, 0],
        },
      },
    },
  },
  translate: {
    draw: translate,
    asp: ASP,
    cam: {
      // "stub" sits on the right edge: keep it clear of the plate when the font runs wide.
      dk: { yaw: 70, el: 50, flow: "up", ground: "none", sn: { stub: [-84, -26] } },
      ph: {
        yaw: 66,
        el: 50,
        ground: "none",
        // phone: a longer column so each part keeps its own label row
        A: 1.5,
        lab: { stub: "w", "function kept": "w" },
        sn: {
          "one rule": [0, 22],
          translator: [0, 30],
          "5 tries · 180 s": [0, 45],
          "one function": [0, 48],
          checked: [0, 58],
          "other rules translate": [0, 43],
          "retry with code + error": [0, -25],
        },
      },
    },
  },
  sandbox: {
    draw: sandbox,
    asp: ASP,
    cam: {
      dk: { yaw: 45, cutaway: 54, sn: { open: [22, 2], setattr: [-6, 6] } },
      ph: {
        yaw: 45,
        cutaway: 40,
        // phone: the callers and the rule go left, so "helper" has the right side to itself
        lab: { "three callers": "w", "the rule": "w" },
        sn: {
          "three callers": [0, -40],
          "the rule": [0, -10],
          "one sandbox": [0, -10],
          helper: [0, -14],
          "fixed modules": [0, 18],
          setattr: [0, 24],
        },
      },
    },
  },
};
