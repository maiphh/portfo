/*
 * Highlights scenes for Legal RAG (repair, fallback, refuse): highlights v2, flow version
 * (HIGHLIGHTS-SPEC v2 §1, §2.5). Port of the prototype's build/scenes.mjs. 5–7 parts per scene, no
 * words in the drawing, one numbered marker per step; the step sentences are in data.ts (flow.steps).
 * Drawn at build time with the iso-glow kernel (MIT, see src/lib/iso/LICENSE-iso-glow).
 */
import { O, W, type FlowScene } from "~/lib/iso/flow";

export const SCENES: Record<string, FlowScene> = {
  repair: {
    dk: { cam: { yaw: 22, el: 64 }, asp: [1.2, 2.2], name: "high front three-quarter" },
    ph: { cam: { yaw: 22, el: 64 }, asp: [1.0, 2.2], name: "high front three-quarter" },
    objs: [
      O("doc", "sheets", [0, 0, 0, 44, 56, 9], { lit: [1], pargs: [0, 0, 0, 44, 56, 3] }),
      O("pieces", "slab", [90, -20, 0, 50, 130, 6], {
        lit: [1],
        draw: (K) => [-20, 30, 80].map((y) => K.box(90, y, 0, 50, 30, 6, 3)).join(""),
        top: false,
      }),
      O("orphan", "slab", [146, -20, 0, 14, 30, 6], {
        lit: [2],
        draw: (K) => K.box(146, -20, 0, 14, 30, 6, 3),
      }),
      O("label", "chip", [210, 20, 0, 50, 50, 15], { lit: [3], pargs: [210, 20, 0, 50] }),
      O("head", "card", [306, 20, 0, 50, 12, 44], {
        lit: [4],
        cite: true,
        pargs: [306, 20, 0, 50, 40],
        top: false,
      }),
      O("lock", "key", [312, 60, 0, 36, 14, 5], { lit: [4] }),
    ],
    wires: [
      W(
        [
          [44, 28],
          [66, 28],
          [66, 45],
          [90, 45],
        ],
        { lit: [1] },
      ),
      W(
        [
          [153, 10],
          [153, 30],
        ],
        { lit: [2] },
      ),
      W(
        [
          [140, 45],
          [210, 45],
        ],
        { lit: [3] },
      ),
      W(
        [
          [260, 45],
          [284, 45],
          [284, 28],
          [302, 28],
        ],
        { lit: [4] },
      ),
    ],
    marks: { 1: [22, 28, 22], 2: [153, -5, 14], 3: [235, 45, 30], 4: [331, 26, 54] },
  },
  fallback: {
    dk: {
      cam: { yaw: 76, el: 26 },
      asp: [0.95, 2.0],
      name: "low side view, the fallbacks stack toward the viewer",
    },
    ph: { cam: { yaw: 76, el: 26 }, asp: [0.9, 2.0], name: "low side view" },
    objs: [
      O("block", "slab", [0, 0, 0, 40, 40, 14], { lit: [1] }),
      O("labeller", "chip", [80, -5, 0, 50, 50, 15], { lit: [1, 2], pargs: [80, -5, 0, 50] }),
      O("tries", "slab", [80, 75, 0, 44, 14, 8], {
        lit: [1],
        x: [2],
        draw: (K) => [0, 1, 2].map((i) => K.box(80 + i * 16, 75, 0, 12, 14, 8, 2)).join(""),
        top: [80, 75, 8, 44, 14],
      }),
      O("sem", "slab", [180, -10, 0, 50, 60, 10], {
        lit: [2],
        draw: (K) => [0, 1, 2, 3].map((i) => K.box(180, -10 + i * 16, 0, 50, 12, 10, 2)).join(""),
        top: false,
      }),
      O("raw", "slab", [180, 85, 0, 40, 40, 14], { lit: [3] }),
      O("keep", "slab", [290, 10, 0, 46, 30, 12], { lit: [4] }),
      O("dup", "slab", [290, 60, 0, 34, 30, 12], { x: [4] }),
    ],
    wires: [
      W(
        [
          [40, 20],
          [80, 20],
        ],
        { lit: [1] },
      ),
      W(
        [
          [102, 45],
          [102, 75],
        ],
        { lit: [1] },
      ),
      W(
        [
          [130, 20],
          [180, 20],
        ],
        { lit: [2] },
      ),
      W(
        [
          [130, 35],
          [150, 35],
          [150, 105],
          [180, 105],
        ],
        { lit: [3] },
      ),
      W(
        [
          [230, 25],
          [290, 25],
        ],
        { lit: [4] },
      ),
      W(
        [
          [220, 105],
          [260, 105],
          [260, 75],
          [290, 75],
        ],
        { lit: [4] },
      ),
    ],
    marks: { 1: [20, 0, 30], 2: [205, -10, 26], 3: [200, 85, 30], 4: [313, 10, 28] },
  },
  refuse: {
    dk: {
      cam: { yaw: 45, el: 44 },
      asp: [1.2, 2.2],
      name: "raised three-quarter (the one near-classic angle)",
    },
    ph: { cam: { yaw: 45, el: 44 }, asp: [1.0, 2.2], name: "raised three-quarter" },
    // C4: #19's config chips (legal-rag/data.ts l.340-343 @1082248), back outside the drawing so the caption matches again
    objs: [
      O("q", "card", [0, 0, 0, 40, 12, 30], { lit: [1], pargs: [0, 0, 0, 40, 30], top: false }),
      O("store", "cyl", [70, -10, 0, 40, 40, 40], { lit: [1], pargs: [70, -10, 0, 40, 40] }),
      O("chunks", "slab", [140, -22, 0, 30, 64, 5], {
        lit: [2],
        draw: (K) => [0, 1, 2].map((i) => K.box(140, -22 + i * 24, 0, 30, 16, 5, 2)).join(""),
        top: false,
      }),
      O("gate", "gate", [200, -25, 0, 8, 70, 46], { lit: [2], pargs: [200, -25, 0, 70, 40] }),
      O("model", "chip", [250, -65, 0, 44, 44, 15], { lit: [4], x: [3], pargs: [250, -65, 0, 44] }),
      O("fallback", "card", [250, 50, 0, 44, 12, 40], {
        lit: [3],
        pargs: [250, 50, 0, 44, 36],
        top: false,
      }),
      O("answer", "sheets", [326, -64, 0, 50, 40, 13], {
        lit: [4],
        pargs: [326, -64, 0, 50, 40, 3],
      }),
      O("cite", "slab", [332, -60, 13, 38, 9, 3], { lit: [4], cite: true, top: false }),
    ],
    wires: [
      W(
        [
          [44, 6],
          [70, 6],
        ],
        { lit: [1] },
      ),
      W(
        [
          [110, 10],
          [140, 10],
        ],
        { lit: [2] },
      ),
      W(
        [
          [170, 10],
          [200, 10],
        ],
        { lit: [2] },
      ),
      W(
        [
          [208, -10],
          [228, -10],
          [228, -43],
          [250, -43],
        ],
        { lit: [4] },
      ),
      W(
        [
          [208, 30],
          [228, 30],
          [228, 56],
          [246, 56],
        ],
        { lit: [3] },
      ),
      W(
        [
          [294, -43],
          [326, -43],
        ],
        { lit: [4] },
      ),
    ],
    marks: { 1: [90, 10, 50], 2: [204, -25, 64], 3: [272, 50, 54], 4: [351, -64, 30] },
  },
};
