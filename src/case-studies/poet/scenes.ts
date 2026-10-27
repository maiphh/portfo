/*
 * Highlights scenes for POET (donate, wall). Port of the prototype's build/projects/poet.mjs (dive scenes only)
 * with the cameras from build/views.mjs. Gifts are sample data; no donors, no photos.
 * Labels and tips are copy (HIGHLIGHTS-SPEC Appendix A, with docs/highlights-copy-decisions: the wall shows
 * "Một nhà hảo tâm" when "Ẩn danh" is ticked). iso-glow kernel: MIT, see src/lib/iso/LICENSE-iso-glow.
 */
import { O } from "~/lib/iso/objects";
import {
  G,
  P,
  Scene,
  Z0,
  prn,
  type Cam,
  type Kernel,
  type PlateScene,
  type SceneT,
  type Spec,
  type V2,
} from "~/lib/iso/scene";

/** What the public wall shows for a gift whose donor ticked "Ẩn danh" (maiphh/poet worker/src/validation.js). */
export const ANON = "Một nhà hảo tâm";
const WALL_TIP = `The public wall shows the name, or “${ANON}” when “Ẩn danh” is ticked, with the message, the amount and when it was paid. These two are sample gifts.`;
const ANON_LAB = {
  t: ANON,
  s: "when “Ẩn danh” is ticked",
  cls: "acc keep",
  k: "wall",
  spec: { off: "0-1" },
  tip: `The name, or “${ANON}” when “Ẩn danh” is ticked.`,
};

const db = (S: SceneT, K: Kernel, x: number, y: number, z: number, spec: Spec, k: string) =>
  G(S, spec, "lt", [0, 1, 2].map((i) => O.disc(K, x + 26, y + 26, z + i * 11, 26, 8)).join(""), k);
const chipT = (
  S: SceneT,
  K: Kernel,
  x: number,
  y: number,
  z: number,
  t: string,
  spec: Spec,
  k: string,
) =>
  O.chip(S, K, x, y, z, 60, spec, k) +
  `<g transform="${K.TOP(x + 12, y + 18, z + 17)}">${prn(S, t, 2, 16, 9)}</g>`;
const scr = (
  S: SceneT,
  K: Kernel,
  x: number,
  y: number,
  z: number,
  spec: Spec,
  cls: string,
  k: string,
) => G(S, spec, cls, O.screen(K, x, y, z, 64, 40), k);

// ---- donate: only the signed webhook writes paid; the return page is a receipt ----
function donate(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { hook: 4, ret: 3 }, mode: "hook", plate: 34 });
  const U = P(ph, { p: 0, n: 130, g: 240, d: 370 }, { p: 0, n: 115, g: 215, d: 330 });
  const off: Spec = { $ret: { off: "0-" } };
  S.put(
    U.p,
    0,
    60,
    60,
    20,
    (K, x, y, z) =>
      chipT(S, K, x, y, z, "PayOS", { hot: "0-", $ret: { hot: "", dim: "0-" } }, "payos"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "PayOS",
        s: "the payment landed",
        cls: "keep",
        k: "payos",
        spec: off,
        tip: "PayOS tells the Worker when the payment lands.",
      },
    },
  );
  S.link(
    [
      [U.p + 32, 0],
      [U.n - 30, 0],
    ],
    { hot: "1-", $ret: { off: "0-" } },
    { go: "1", $ret: { go: "" } },
  );
  S.put(
    U.n,
    0,
    56,
    40,
    6,
    (K, x, y, z) =>
      G(
        S,
        { hot: "1-", $ret: { hot: "", dim: "0-" } },
        "lt",
        O.envelope(K, x, y, z, 56, 40),
        "hook",
      ) +
      G(
        S,
        { hot: "1-", $ret: { hot: "", dim: "0-" } },
        "lt",
        O.disc(K, x + 40, y + 28, z + 6, 7, 3),
        "hook",
      ),
    { lab: { a: "s", pa: "e", t: "signed notice", k: "hook", spec: off } },
  );
  S.link(
    [
      [U.n + 30, 0],
      [U.g - 6, 0],
    ],
    { hot: "2-", $ret: { off: "0-" } },
    { go: "2", $ret: { go: "" } },
  );
  S.put(
    U.g,
    0,
    10,
    80,
    42,
    (K, x, y, z) =>
      O.gate(S, K, x, y, z, 80, 42, { hot: "2-", $ret: { hot: "", dim: "0-" } }, "sig"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "signature checked",
        k: "sig",
        spec: off,
        tip: "The signature is checked, and only then is the gift marked paid.",
      },
    },
  );
  S.link(
    [
      [U.g + 6, 0],
      [U.d - 30, 0],
    ],
    { hot: "3-", $ret: { off: "0-" } },
    { go: "3", $ret: { go: "" } },
  );
  S.put(
    U.d,
    0,
    52,
    52,
    30,
    (K, x, y, z) => db(S, K, x, y, z, { ln: "0-", hot: "3-", $ret: { hot: "" } }, "db"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "gift: paid",
        cls: "acc",
        k: "db",
        spec: { off: "0-2", $ret: { off: "0-" } },
      },
    },
  );
  S.label([...S.map(U.d + 26, 0), Z0 + 30], {
    a: P(ph, "n", "e"),
    t: "gift: still unpaid",
    cls: "err",
    k: "db",
    spec: { off: "0-", $ret: { off: "0-1" } },
    tip: "Returning to the site does not mark it paid.",
  });
  // the donor comes back to the site: a receipt, no write
  const R = P<V2>(ph, [U.g, 120], [U.d + 115, 0]);
  S.put(
    R[0],
    R[1],
    64,
    40,
    50,
    (K, x, y, z) => scr(S, K, x, y, z, { dim: "0-", $ret: { ln: "0-", dim: "" } }, "ln-g", "ret"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "back on the site",
        s: "a receipt",
        cls: "keep",
        k: "ret",
        tip: "That page is a receipt.",
      },
    },
  );
  S.link(
    ph
      ? [
          [R[0] - 34, 0],
          [U.d + 30, 0],
        ]
      : [
          [R[0] + 34, R[1]],
          [U.d, R[1]],
          [U.d, 30],
        ],
    { off: "0-", $ret: { off: "0-1", er: "2-" } },
    { $ret: { go: "2" } },
  );
  return S;
}

// ---- wall: paid → an admin publishes → shown on the wall (sample gifts) ----
function wall(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { d: 3 }, mode: "d", plate: 34 });
  const U = P(ph, { d: 0, g: 140, w: 290 }, { d: 0, g: 125, w: 260 });
  S.put(U.d, 0, 52, 52, 30, (K, x, y, z) => db(S, K, x, y, z, { hot: "0-" }, "db"), {
    lab: {
      a: "n",
      pa: "e",
      t: "gift paid",
      k: "db",
      tip: "A gift appears on the wall after it is paid and an admin publishes it.",
    },
  });
  S.link(
    [
      [U.d + 30, 0],
      [U.g - 6, 0],
    ],
    { hot: "1-" },
    { go: "1" },
  );
  S.put(U.g, 0, 10, 80, 42, (K, x, y, z) => O.gate(S, K, x, y, z, 80, 42, { hot: "1-" }, "pub"), {
    lab: {
      a: "n",
      pa: "e",
      t: "an admin publishes",
      k: "pub",
      tip: "A donor’s name does not go public without someone checking it.",
    },
  });
  S.link(
    [
      [U.g + 6, 0],
      [U.w - 34, 0],
    ],
    { hot: "2-" },
    { go: "2" },
  );
  const gap = 34,
    up = !ph && S.cam.upright;
  const line = (K: Kernel, x: number, y: number, z: number, w: number) =>
    `<g transform="${K.FRONT(x, y, z)}"><path class="detail strong" d="M8 10 H${w - 20} M8 20 H${w - 8} M8 30 H${w - 30}"/></g>`;
  const wallLab = { t: "the wall", s: "two sample gifts", cls: "keep", k: "wall", tip: WALL_TIP };
  if (up) {
    // the wall as a wall: two sample gifts standing side by side, facing the camera
    S.put(U.w + 40, 0, 156, 16, 4, (K, x, y, z) =>
      G(S, { ln: "2-" }, "ln-g", K.box(x, y, z, 156, 16, 4, 2), "wall"),
    );
    [0, 1].forEach((i) =>
      S.put(
        U.w + i * 78,
        0,
        66,
        6,
        52,
        (K, x, y, z) =>
          G(
            S,
            { ln: "2-", hot: i ? "" : "2-" },
            i ? "ln-g" : "lt",
            K.box(x, y, z + 4, 66, 6, 48, 0) + line(K, x, y + 6, z + 52, 66),
            "wall",
          ),
        i === 1 ? { lab: { a: "e", ...wallLab } } : {},
      ),
    );
    S.label([...S.map(U.w, 0), Z0 + 56], { a: "n", ...ANON_LAB });
    return S;
  }
  [-1, 1].forEach((s, i) =>
    S.put(
      U.w + (ph ? i * 74 : 0),
      ph ? 0 : s * gap,
      60,
      44,
      6,
      (K, x, y, z) =>
        G(
          S,
          { ln: "2-", hot: i ? "" : "2-" },
          i ? "ln-g" : "lt",
          K.box(x, y, z, 60, 44, 6, 4) +
            `<g transform="${K.TOP(x, y, z + 6)}"><path class="detail strong" d="M8 10 H40 M8 20 H52 M8 30 H30"/></g>`,
          "wall",
        ),
      i === 1 ? { lab: { a: "s", pa: "e", ...wallLab } } : {},
    ),
  );
  if (ph)
    S.link(
      [
        [U.w + 30, 0],
        [U.w + 44, 0],
      ],
      { ln: "2-" },
    );
  S.label([...S.map(U.w + 30, P(ph, -gap, 0)), Z0 + 6], { a: P(ph, "n", "e"), ...ANON_LAB });
  return S;
}

const ASP: [number, number] = [1.45, 0.62];
export const SCENES: Record<string, PlateScene> = {
  donate: {
    draw: donate,
    asp: ASP,
    cam: { dk: { yaw: 16, el: 14, flow: "scr" }, ph: { yaw: 18, el: 24 } },
  },
  wall: {
    draw: wall,
    asp: ASP,
    cam: {
      dk: { yaw: 4, el: 10, flow: "x", ground: "outline", upright: true },
      ph: { yaw: 6, el: 30, ground: "outline" },
    },
  },
};
