/*
 * Highlights scenes for Ecom (payment, admin, store). Port of the prototype's build/projects/ecom.mjs
 * (dive scenes only) with the cameras from build/views.mjs. Private repo: no code, no shop URL, no sales.
 * Labels and tips are copy (HIGHLIGHTS-SPEC Appendix A). iso-glow kernel: MIT, see src/lib/iso/LICENSE-iso-glow.
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

const PARTS = ["catalog", "cart", "price", "stock", "payment", "orders"];
const EW = 168,
  ED = 116;
// the engine: one slab, six parts on it
const engine = (
  S: SceneT,
  K: Kernel,
  x: number,
  y: number,
  z: number,
  spec: Spec,
  part: (i: number) => Spec = () => ({ ln: "0-" }),
  k = "eng",
) =>
  G(S, spec, "ln-g", K.box(x, y, z, EW, ED, 12, 8), k) +
  PARTS.map((t, i) => {
    const tx = x + 8 + (i % 3) * 52,
      ty = y + 8 + Math.floor(i / 3) * 52;
    return G(
      S,
      part(i),
      "lt",
      K.box(tx, ty, z + 12, 48, 48, 8, 4) +
        `<g transform="${K.TOP(tx, ty, z + 20)}">${prn(S, t, 5, 28, 9)}</g>`,
      "part",
    );
  }).join("");
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

// ---- payment: PayOS confirms, the amount and order match, the order machine marks it paid ----
function payment(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { paid: 5, cancel: 5, cod: 3 }, mode: "paid", plate: 34 });
  const U = P(
    ph,
    { co: 0, pay: 130, nt: 250, gt: 370, od: 500 },
    { co: 0, pay: 120, nt: 220, gt: 315, od: 420 },
  );
  const offCod: Spec = { $cod: { off: "0-" } };
  S.put(
    U.co,
    0,
    56,
    70,
    10,
    (K, x, y, z) => G(S, { ln: "0-" }, "ln-g", O.sheets(K, x, y, z, 56, 70, 2), "co"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "checkout",
        k: "co",
        tip: "Checkout charges through PayOS, or the buyer picks cash on delivery.",
      },
    },
  );
  S.link(
    [
      [U.co + 32, 0],
      [U.pay - 32, 0],
    ],
    { hot: "1-", $cod: { off: "0-" } },
    { go: "1", $cod: { go: "" } },
  );
  S.put(
    U.pay,
    0,
    60,
    60,
    20,
    (K, x, y, z) =>
      O.chip(S, K, x, y, z, 60, { hot: "1-", $cod: { dim: "0-" } }, "pay") +
      `<g transform="${K.TOP(x + 14, y + 18, z + 17)}">${prn(S, "PayOS", 2, 16, 9)}</g>`,
    {
      lab: {
        a: "n",
        pa: "e",
        t: "PayOS charges",
        k: "pay",
        spec: offCod,
        tip: "Checkout charges through PayOS.",
      },
    },
  );
  S.link(
    [
      [U.pay + 32, 0],
      [U.nt - 32, 0],
    ],
    { hot: "2-", $cod: { off: "0-" } },
    { go: "2", $cod: { go: "" } },
  );
  S.put(
    U.nt,
    0,
    56,
    40,
    6,
    (K, x, y, z) =>
      G(S, { hot: "2-", $cod: { dim: "0-" } }, "lt", O.envelope(K, x, y, z, 56, 40), "nt"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "confirmed",
        k: "nt",
        spec: { off: "0-1", $cancel: { off: "0-" }, $cod: { off: "0-" } },
        tip: "PayOS confirms the payment.",
      },
    },
  );
  S.label(ph ? [...S.map(U.nt, 28), Z0 + 3] : [...S.map(U.nt - 28, -20), Z0 + 6], {
    a: P(ph, "n", "e"),
    t: "notice · order cancelled",
    cls: "err",
    k: "nt",
    spec: { off: "0-", $cancel: { off: "0-1" } },
    tip: "A notice for a cancelled order is rejected.",
  });
  S.link(
    [
      [U.nt + 30, 0],
      [U.gt - 6, 0],
    ],
    { hot: "3-", $cancel: { er: "3-", hot: "" }, $cod: { off: "0-" } },
    { go: "3", $cancel: { go: "3" }, $cod: { go: "" } },
  );
  S.put(
    U.gt,
    0,
    10,
    80,
    42,
    (K, x, y, z) =>
      O.gate(
        S,
        K,
        x,
        y,
        z,
        80,
        42,
        { hot: "3-", $cancel: { er: "3-", hot: "" }, $cod: { dim: "0-" } },
        "gt",
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "amount + order match",
        k: "gt",
        spec: { $cancel: { off: "3-" }, $cod: { off: "0-" } },
        tip: "When the amount and the order match, the order is marked paid.",
      },
    },
  );
  S.label(ph ? [...S.map(U.gt, 40), Z0 + 21] : [...S.map(U.gt + 5, 40), Z0], {
    a: P(ph, "s", "e"),
    t: "rejected",
    cls: "err",
    k: "gt",
    spec: { off: "0-", $cancel: { off: "0-3" } },
    tip: "A notice for a cancelled order is rejected.",
  });
  S.link(
    [
      [U.gt + 6, 0],
      [U.od - 32, 0],
    ],
    { hot: "4-", $cancel: { off: "0-" }, $cod: { off: "0-" } },
    { go: "4", $cancel: { go: "" }, $cod: { go: "" } },
  );
  // the prototype passed the string 'led' as rack LEDs (it drew a stray text node); no LEDs here
  S.put(
    U.od,
    0,
    60,
    60,
    44,
    (K, x, y, z) =>
      G(
        S,
        { ln: "0-", hot: "4-", $cancel: { hot: "" }, $cod: { hot: "", ln: "0-" } },
        "lt",
        O.rack(K, x, y, z, 60, 60, 44),
        "od",
      ),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "the order machine",
        k: "od",
        spec: { off: "4-", $cancel: { off: "" }, $cod: { off: "" } },
        tip: "PayOS confirms the payment. The order machine records it.",
      },
    },
  );
  S.label([...S.map(U.od - 30, -30), Z0 + 44], {
    a: "n",
    pa: "e",
    t: "order paid",
    cls: "acc",
    k: "od",
    spec: { off: "0-3", $cancel: { off: "0-" }, $cod: { off: "0-" } },
    tip: "When PayOS confirms and the amount and the order match, the order is marked paid.",
  });
  // coming back to the site is not what marks the order paid
  const R = P<V2>(ph, [U.od, 120], [U.od + 110, 0]);
  S.put(
    R[0],
    R[1],
    64,
    40,
    50,
    (K, x, y, z) => scr(S, K, x, y, z, { ln: "0-", $cod: { dim: "0-" } }, "ln-g", "ret"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "back to the site",
        s: "does not mark it paid",
        cls: "keep",
        k: "ret",
        spec: offCod,
        tip: "Coming back to the site is not what marks the order paid.",
      },
    },
  );
  S.link(
    ph
      ? [
          [R[0] - 34, 0],
          [U.od + 34, 0],
        ]
      : [
          [U.od, R[1] - 24],
          [U.od, 34],
        ],
    { er: "0-", $cod: { off: "0-" } },
  );
  // cash on delivery: a separate lane, no charge
  const lv = P(ph, -95, 70);
  S.link(
    [
      [U.co, P(ph, -38, 38)],
      [U.co, lv],
      [U.od, lv],
      [U.od, P(ph, -34, 34)],
    ],
    { off: "0-", $cod: { hot: "1-", off: "0" } },
    { $cod: { go: "1" } },
  );
  S.label([...S.map((U.pay + U.nt) / 2, lv), Z0], {
    a: P(ph, "n", "e"),
    t: "cash on delivery",
    s: "no charge created",
    cls: "acc keep",
    spec: { off: "0-", $cod: { off: "0" } },
    tip: "Cash on delivery is a separate choice. It does not create a charge.",
  });
  return S;
}

// ---- admin: two doors into one engine; the desk keeps no second checkout ----
function admin(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { d: 3 }, mode: "d", plate: 34 });
  const E = P<V2>(ph, [210, 0], [175, 0]);
  const F = P<V2>(ph, [0, -75], [0, 0]),
    D = P<V2>(ph, [0, 85], [350, 0]);
  S.put(F[0], F[1], 64, 40, 50, (K, x, y, z) => scr(S, K, x, y, z, { ln: "0-" }, "ln-g", "fr"), {
    lab: {
      a: "n",
      pa: "e",
      t: "storefront",
      s: "buyers",
      cls: "keep",
      k: "fr",
      tip: "Buyers do not see the desk.",
    },
  });
  S.link(
    ph
      ? [
          [F[0] + 34, 0],
          [E[0] - 62, 0],
        ]
      : [
          [F[0] + 34, F[1]],
          [E[0] - 88, F[1]],
        ],
    { hot: "0-" },
    { go: "0" },
  );
  S.put(
    E[0],
    E[1],
    EW,
    ED,
    20,
    (K, x, y, z) => engine(S, K, x, y, z, { ln: "0-" }, () => ({ hot: "2-" })),
    {
      lab: {
        a: "e",
        pa: "e",
        t: "one engine",
        k: "eng",
        tip: "The desk uses the same engine as the store.",
      },
    },
  );
  S.link(
    ph
      ? [
          [E[0] + 62, 0],
          [D[0] - 40, 0],
        ]
      : [
          [D[0] + 40, D[1]],
          [E[0] - 88, D[1]],
        ],
    { hot: "1-" },
    { go: "1" },
  );
  S.put(
    D[0],
    D[1],
    72,
    72,
    10,
    (K, x, y, z) =>
      G(
        S,
        { ln: "1-" },
        "ln-g",
        K.box(x, y, z, 72, 72, 10, 6) +
          [0, 1, 2].map((i) => K.box(x + 8 + i * 20, y + 10, z + 10, 16, 52, 6, 3)).join(""),
        "desk",
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "/admin desk",
        s: "catalog · orders · sales",
        cls: "mono keep",
        k: "desk",
        tip: "The seller edits the catalog, follows orders, and manages sales. /admin sends a seller to the desk.",
      },
    },
  );
  const X = P<V2>(ph, [-110, 85], [460, 0]);
  S.put(
    X[0],
    X[1],
    52,
    56,
    10,
    (K, x, y, z) =>
      G(
        S,
        { off: "0-1", er: "2-" },
        "rej",
        K.box(x, y, z, 52, 56, 10, 4) + O.xmark(K, x + 11, y + 13, z + 10, 30),
        "x2",
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "no second checkout",
        cls: "err",
        k: "x2",
        spec: { off: "0-1" },
        tip: "The desk does not keep a second copy of checkout.",
      },
    },
  );
  return S;
}

// ---- store: pages swap, the engine stays ----
function store(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { mirror: 3, next: 3 }, mode: "next", plate: 34 });
  const E = P<V2>(ph, [210, 0], [175, 0]);
  const M = P<V2>(ph, [0, -75], [0, 0]),
    N = P<V2>(ph, [0, 85], [350, 0]);
  const pages = (on: Spec, k: string) => (K: Kernel, x: number, y: number, z: number) =>
    G(S, on, "ln-g", O.sheets(K, x, y, z, 56, 70, 3), k);
  S.put(M[0], M[1], 56, 70, 12, pages({ ln: "0-", $next: { dim: "0-" } }, "mn"), {
    lab: {
      a: "n",
      pa: "e",
      t: "Mirror Now’s pages",
      k: "mn",
      tip: "Mirror Now is the first set of pages on the engine.",
    },
  });
  S.link(
    ph
      ? [
          [M[0] + 34, 0],
          [E[0] - 62, 0],
        ]
      : [
          [M[0] + 32, M[1]],
          [E[0] - 88, M[1]],
        ],
    { hot: "1-", $next: { dim: "0-" } },
    { go: "1", $next: { go: "" } },
  );
  S.put(
    N[0],
    N[1],
    56,
    70,
    12,
    (K, x, y, z) =>
      pages({ off: "0-", $next: { ln: "0-", off: "" } }, "nx")(K, x, y, z) +
      G(S, { $next: { off: "0-" } }, "ghost", O.sheets(K, x, y, z, 56, 70, 3)),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "the next store’s pages",
        k: "nx",
        tip: "A new shop is another set of pages that call that engine.",
      },
    },
  );
  S.link(
    ph
      ? [
          [E[0] + 62, 0],
          [N[0] - 34, 0],
        ]
      : [
          [N[0] + 32, N[1]],
          [E[0] - 88, N[1]],
        ],
    { off: "0-", $next: { hot: "1-", off: "0" } },
    { $next: { go: "1" } },
  );
  S.put(
    E[0],
    E[1],
    EW,
    ED,
    20,
    (K, x, y, z) =>
      engine(S, K, x, y, z, { ln: "0-" }, (i) => (i >= 4 ? { hot: "2-" } : { ln: "0-" })),
    {
      lab: {
        a: "e",
        pa: "e",
        t: "engine stays",
        s: "checkout not rewritten",
        cls: "keep",
        k: "eng",
        tip: "Changing a page does not rewrite checkout.",
      },
    },
  );
  return S;
}

const ASP: [number, number] = [1.45, 0.62];
export const SCENES: Record<string, PlateScene> = {
  payment: {
    draw: payment,
    asp: ASP,
    cam: {
      dk: {
        yaw: 62,
        el: 30,
        flow: "up",
        sn: { "PayOS charges": [-50, -34], rejected: [-12, -8] },
      },
      ph: {
        yaw: 62,
        el: 32,
        sn: { "notice · order cancelled": [0, -14], "amount + order match": [0, 6] },
      },
    },
  },
  admin: {
    draw: admin,
    asp: ASP,
    cam: {
      dk: { yaw: 18, el: 14, flow: "scr", sn: { "no second checkout": [-30, 46] } },
      ph: { yaw: 20, el: 24 },
    },
  },
  store: {
    draw: store,
    asp: ASP,
    cam: { dk: { yaw: 36, el: 50, ground: "none" }, ph: { yaw: 36, el: 50, ground: "none" } },
  },
};
