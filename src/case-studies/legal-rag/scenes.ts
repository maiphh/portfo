/*
 * Highlights scenes for Legal RAG (repair, fallback, refuse). Port of the prototype's build/projects/rag.mjs
 * (dive scenes only) with the cameras from build/views.mjs. Placeholder numbering only, no document content.
 * Labels and tips are copy (HIGHLIGHTS-SPEC Appendix A). iso-glow kernel: MIT, see src/lib/iso/LICENSE-iso-glow.
 */
import { O } from "~/lib/iso/objects";
import { G, P, Scene, Z0, prn, type Cam, type PlateScene, type Spec } from "~/lib/iso/scene";

const stack = (K: Parameters<typeof O.disc>[0], x: number, y: number, z: number) =>
  [0, 1, 2].map((i) => O.disc(K, x + 28, y + 28, z + i * 9, 26, 7)).join("");

// ---- repair: coarse pieces, boundaries, bare heading merged, short clause moved, level hint, header locked ----
function repair(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { d: 5 }, mode: "d", plate: 34 });
  const step = P(ph, 120, 132),
    N = 4,
    L = P(ph, 96, 104),
    Wd = P(ph, 70, 118);
  for (let i = 0; i < N; i++) {
    const u = i * step;
    S.put(
      u,
      0,
      L,
      Wd,
      8,
      (K, x, y, z) =>
        G(
          S,
          { ln: "0-" },
          "ln-g",
          K.box(x, y, z, L, Wd, 8, 4) +
            `<g transform="${K.TOP(x, y, z + 8)}">${[0, 1, 2].map((j) => `<rect class="detail" x="${10 + j * 28}" y="14" width="20" height="${Wd - 28}" rx="2"/>`).join("")}</g>`,
          "piece",
        ),
      i === 0
        ? {
            lab: {
              a: "s",
              pa: "w",
              t: "4,000-char pieces",
              k: "piece",
              tip: "The coarse split works in 4,000-character pieces and prefers legal boundaries.",
            },
          }
        : {},
    );
    if (i < N - 1)
      S.put(
        u + step / 2,
        0,
        6,
        Wd + 16,
        5,
        (K, x, y, z) => G(S, { hot: "0" }, "lt", K.box(x, y, z, 6, Wd + 16, 5, 2), "bnd"),
        i === (ph ? 1 : 2)
          ? {
              lab: {
                a: "n",
                pa: "w",
                t: "Điều · Phụ lục · Chương",
                cls: "mono",
                k: "bnd",
                tip: "Markdown headers and the words Điều, Phụ lục and Chương come before any ordinary newline.",
              },
            }
          : {},
      );
  }
  // a bare "Điều N" heading left at the end of piece 0 → moves to the head of piece 1
  const hu = 30,
    nu = step - 30;
  S.put(
    hu,
    0,
    30,
    30,
    18,
    (K, x, y, z) => G(S, { er: "1", off: "2-" }, "lt", K.box(x, y, z + 8, 30, 30, 10, 3), "bare"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "bare “Điều N”",
        cls: "mono err keep",
        k: "bare",
        spec: { off: "0,2-" },
        tip: "A heading with no body is merged into the next piece.",
      },
    },
  );
  S.put(
    nu,
    0,
    30,
    30,
    18,
    (K, x, y, z) =>
      G(S, { hot: "2", ln: "3-", off: "0-1" }, "lt", K.box(x, y, z + 8, 30, 30, 10, 3), "bare"),
    {
      lab: { a: "s", pa: "e", t: "merged forward", cls: "acc", k: "bare", spec: { off: "0-1,3-" } },
    },
  );
  // a short "Khoản 1" moves forward to sit with its article
  const ku = step + 30,
    ku2 = 2 * step - 30;
  S.put(
    ku,
    0,
    30,
    30,
    18,
    (K, x, y, z) =>
      G(S, { er: "2", off: "0-1,3-" }, "lt", K.box(x, y, z + 8, 30, 30, 10, 3), "short"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "“Khoản 1” < 50 chars",
        cls: "mono err keep",
        k: "short",
        spec: { off: "0-1,3-" },
        tip: "A “Khoản 1” shorter than 50 characters moves forward with its article.",
      },
    },
  );
  S.put(ku2, 0, 30, 30, 18, (K, x, y, z) =>
    G(S, { ln: "3-", off: "0-2" }, "lt", K.box(x, y, z + 8, 30, 30, 10, 3), "short"),
  );
  // level hint: a thread from the last piece's end into the next one
  S.link(
    [
      [2.5 * step, Wd / 2 + 16],
      [3 * step + 10, Wd / 2 + 16],
    ],
    { hot: "3-", off: "0-2" },
    { go: "3" },
  );
  S.label([...S.map(3 * step + 10, Wd / 2 + 16), Z0], {
    a: P(ph, "s", "e"),
    t: "level hint",
    cls: "acc",
    k: "hint",
    spec: { off: "0-2" },
    tip: "Each block is labelled with the previous block’s level as a hint, so a block that opens with 3. or c) stays under that article.",
  });
  // id + title locked: a lock on the first piece
  const lu = 0;
  S.put(
    lu,
    P(ph, Wd / 5, -Wd / 4),
    30,
    26,
    24,
    (K, x, y, z) =>
      G(
        S,
        { hot: "4-", off: "0-3" },
        "lt lock",
        K.box(x, y, z + 8, 30, 26, 14, 3) +
          `<g transform="${K.TOP(x, y, z + 22)}"><path class="shackle" d="M8 13 v-5 a7 7 0 0 1 14 0 v5"/></g>`,
        "lock",
      ),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "id + title locked",
        cls: "acc",
        k: "lock",
        spec: { off: "0-3" },
        tip: "The first good document id and the longest complete title are locked, so a middle page can’t wipe the citation header.",
      },
    },
  );
  return S;
}

// ---- fallback: JSON-only labels, three tries, then a semantic split, then dedupe ----
function fallback(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { ok: 4, fail: 6 }, mode: "fail", plate: 34 });
  const U = P(
    ph,
    { blk: 0, lab: 140, tr: 250, sem: 370, dd: 480, st: 580 },
    { blk: 0, lab: 120, tr: 225, sem: 330, dd: 430, st: 520 },
  );
  S.put(
    U.blk,
    0,
    70,
    90,
    14,
    (K, x, y, z) => G(S, { ln: "0-" }, "ln-g", O.sheets(K, x + 6, y + 6, z, 60, 80, 3), "blk"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "a block",
        k: "blk",
        tip: "A block of legal text, ready to be labelled.",
      },
    },
  );
  S.link(
    [
      [U.blk + 40, 0],
      [U.lab - 34, 0],
    ],
    { hot: "0-" },
    { go: "0" },
  );
  S.put(
    U.lab,
    0,
    64,
    64,
    20,
    (K, x, y, z) =>
      O.chip(S, K, x, y, z, 64, { hot: "1", ln: "2-", $fail: { hot: "1", er: "3" } }, "llm") +
      `<g transform="${K.TOP(x + 19, y + 19, z + 17)}">${prn(S, "JSON", 3, 16, 10)}</g>`,
    {
      lab: {
        a: "n",
        pa: "e",
        t: "labeller",
        s: "JSON only",
        cls: "keep",
        k: "llm",
        tip: "The model may only answer in JSON. Anything else is a failed try.",
      },
    },
  );
  // three tries
  for (let i = 0; i < 3; i++)
    S.put(
      U.tr,
      (i - 1) * 30,
      22,
      22,
      10,
      (K, x, y, z) =>
        G(
          S,
          {
            hot: i === 0 ? "2-" : "",
            off: i === 0 ? "" : "0-",
            $fail: { er: `${i + 1}-`, off: "0", hot: "" },
          },
          "lt",
          K.box(x, y, z, 22, 22, 8, 3),
          "try",
        ),
      i === 2
        ? {
            lab: {
              a: "s",
              pa: "e",
              t: "3 tries",
              k: "try",
              tip: "Three tries at a valid JSON label.",
            },
          }
        : {},
    );
  S.link(
    [
      [U.lab + 36, 0],
      [U.tr - 16, 0],
    ],
    { hot: "1-" },
    { go: "1" },
  );
  // semantic split (fail only)
  S.link(
    [
      [U.tr + 16, 0],
      [U.sem - 34, 0],
    ],
    { off: "0-", $fail: { hot: "4-", off: "0-3" } },
    { $fail: { go: "4" } },
  );
  S.put(
    U.sem,
    0,
    60,
    60,
    20,
    (K, x, y, z) =>
      G(
        S,
        { off: "0-", $fail: { off: "0-3" } },
        "obj",
        O.chip(S, K, x, y, z, 60, { $fail: { hot: "4", ln: "5-" } }, "sem"),
      ),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "semantic split",
        s: "Vietnamese bi-encoder",
        cls: "keep",
        k: "sem",
        spec: { off: "0-", $fail: { off: "0-3" } },
        tip: "After three failures, the block is split by meaning with a Vietnamese bi-encoder instead of being dropped. On other errors the raw block is kept.",
      },
    },
  );
  // dedupe gate and store
  const lastIn: Spec = { hot: "3-", $fail: { hot: "5-" } };
  S.link(
    [
      [ph ? U.tr + 16 : U.sem + 34, 0],
      [U.dd - 8, 0],
    ],
    { ...lastIn, $fail: { hot: "5-" } },
    { go: "3", $fail: { go: "5" } },
  );
  S.put(
    U.dd,
    0,
    10,
    80,
    40,
    (K, x, y, z) => O.gate(S, K, x, y, z, 80, 40, { hot: "3", $fail: { hot: "5" } }, "dd"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "dedupe",
        s: "within one Điều",
        cls: "keep",
        k: "dd",
        tip: "A chunk that closely matches the one before it, or is contained in it within the same Điều, is dropped. The longer one stays.",
      },
    },
  );
  S.link(
    [
      [U.dd + 8, 0],
      [U.st - 30, 0],
    ],
    lastIn,
  );
  S.put(
    U.st,
    0,
    56,
    56,
    26,
    (K, x, y, z) => G(S, { ln: "3-", $fail: { ln: "5-" } }, "ln-g", stack(K, x, y, z), "st"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "text kept",
        cls: "acc",
        k: "st",
        spec: { off: "0-2", $fail: { off: "0-4" } },
      },
    },
  );
  return S;
}

// ---- refuse: question → cosine search → threshold → answer with citation, or the fallback sentence ----
function refuse(ph: boolean, cam: Cam) {
  const S = Scene({ ph, cam, n: { hit: 5, miss: 5 }, mode: "miss", plate: 34 });
  const U = P(
    ph,
    { q: 0, emb: 130, db: 250, gt: 360, llm: 470, out: 590 },
    { q: 0, emb: 115, db: 220, gt: 315, llm: 420, out: 520 },
  );
  S.put(
    U.q,
    0,
    60,
    10,
    46,
    (K, x, y, z) => G(S, { ln: "0-" }, "ln-g", O.card(K, x, y, z, 60, 38, 3), "q"),
    {
      lab: { a: "n", pa: "e", t: "a question", k: "q" },
    },
  );
  S.link(
    [
      [U.q + 30, 0],
      [U.emb - 30, 0],
    ],
    { hot: "1-" },
    { go: "1" },
  );
  S.put(
    U.emb,
    0,
    56,
    56,
    20,
    (K, x, y, z) => O.chip(S, K, x, y, z, 56, { hot: "1", ln: "2-" }, "emb"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "vectors",
        s: "cosine distance",
        cls: "keep",
        k: "emb",
        tip: "The question is embedded and compared by cosine distance. There is no keyword index in this service.",
      },
    },
  );
  S.link(
    [
      [U.emb + 30, 0],
      [U.db - 30, 0],
    ],
    { hot: "1-" },
  );
  S.put(U.db, 0, 56, 56, 26, (K, x, y, z) => G(S, { ln: "1-" }, "ln-g", stack(K, x, y, z), "db"), {
    lab: { a: "s", pa: "e", t: "top_k", k: "db", tip: "The closest chunks come back." },
  });
  S.link(
    [
      [U.db + 30, 0],
      [U.gt - 6, 0],
    ],
    { hot: "2-" },
    { go: "2" },
  );
  S.put(
    U.gt,
    0,
    10,
    90,
    44,
    (K, x, y, z) =>
      O.gate(S, K, x, y, z, 90, 44, { hot: "2", $miss: { er: "3-", hot: "2" } }, "gt"),
    {
      lab: {
        a: "n",
        pa: "e",
        t: "threshold",
        s: "rerank on · sigmoid",
        cls: "keep",
        k: "gt",
        tip: "With rerank on, scores pass through a sigmoid and anything under the threshold is dropped.",
      },
    },
  );
  S.label([...S.map(U.gt + 20, 30), Z0], {
    a: P(ph, "s", "e"),
    t: "nothing left",
    cls: "err",
    spec: { off: "0-", $miss: { off: "0-2" } },
  });
  S.link(
    [
      [U.gt + 6, 0],
      [U.llm - 30, 0],
    ],
    { hot: "3-", $miss: { off: "0-", hot: "" } },
    { go: "3", $miss: {} },
  );
  S.put(
    U.llm,
    0,
    60,
    60,
    20,
    (K, x, y, z) =>
      G(
        S,
        { $miss: { dim: "3-" } },
        "obj",
        O.chip(S, K, x, y, z, 60, { hot: "3", ln: "4-", $miss: { hot: "", ln: "" } }, "llm"),
      ),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "model",
        s: "never called",
        cls: "err keep",
        k: "llm",
        tip: "When nothing passes, the model is never called.",
        spec: { $miss: { off: "0-3" }, off: "0-" },
      },
    },
  );
  S.link(
    [
      [U.llm + 32, 0],
      [U.out - 30, 0],
    ],
    { hot: "4-", $miss: { off: "0-" } },
    { go: "4", $miss: {} },
  );
  S.put(
    U.out,
    0,
    70,
    10,
    60,
    (K, x, y, z) => G(S, { ln: "4-" }, "ln-g", O.card(K, x, y, z, 70, 52, 4), "out"),
    {
      lab: {
        a: "s",
        pa: "e",
        t: "answer",
        s: "citation line first",
        cls: "cite keep",
        k: "out",
        tip: "With chunks, the prompt allows only the retrieved context and requires the citation line first.",
        spec: { off: "0-3", $miss: { off: "0-" } },
      },
    },
  );
  S.label(ph ? [...S.map(U.out + 35, 5), Z0] : [...S.map(U.out - 35, -5), Z0 + 64], {
    a: P(ph, "n", "e"),
    t: "fallback sentence",
    s: "stored, not generated",
    cls: "err keep",
    k: "out",
    tip: "Xin lỗi, tôi không tìm thấy thông tin cần thiết.",
    spec: { off: "0-", $miss: { off: "0-3" } },
  });
  return S;
}

const ASP: [number, number] = [1.45, 0.62];
export const SCENES: Record<string, PlateScene> = {
  repair: {
    draw: repair,
    asp: ASP,
    cam: {
      dk: { yaw: 0, el: 90, flow: "x", ground: "grid" },
      ph: {
        yaw: 0,
        el: 90,
        ground: "grid",
        sn: { "merged forward": [-6, -24], "“Khoản 1” < 50 chars": [0, 4] },
      },
    },
  },
  fallback: {
    draw: fallback,
    asp: ASP,
    cam: {
      dk: { yaw: 12, el: 20, flow: "scr", sn: { dedupe: [30, -26] } },
      ph: { yaw: 16, el: 28 },
    },
  },
  refuse: {
    draw: refuse,
    asp: ASP,
    cam: {
      dk: {
        yaw: 58,
        el: 40,
        flow: "up",
        ground: "none",
        sn: { "nothing left": [-74, 16], model: [36, 0] },
      },
      ph: {
        yaw: 56,
        el: 44,
        ground: "none",
        sn: { top_k: [0, -5], "nothing left": [0, 10], model: [0, 6] },
      },
    },
  },
};
