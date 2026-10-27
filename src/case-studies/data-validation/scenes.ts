/*
 * Highlights scenes for the Data Validation Platform (validate, translate, sandbox): highlights v2, flow version
 * (HIGHLIGHTS-SPEC v2 §1, §2.5). Port of the prototype's build/scenes.mjs. 5–7 parts per scene, no
 * words in the drawing, one numbered marker per step; the step sentences are in data.ts (flow.steps).
 * Drawn at build time with the iso-glow kernel (MIT, see src/lib/iso/LICENSE-iso-glow).
 */
import { O, W, prim, type FlowScene } from "~/lib/iso/flow";

export const SCENES: Record<string, FlowScene> = {
  validate: {
    dk: { cam: { yaw: 4, el: 46 }, asp: [1.2, 2.0], name: "raised front view, square-on" },
    ph: { cam: { yaw: 4, el: 46 }, asp: [1.0, 2.0], name: "raised front view" },
    objs: [
      O("file", "slab", [0, 0, 0, 100, 100, 6], {
        lit: [1],
        draw: (K) =>
          K.box(0, 0, 0, 100, 100, 6) +
          [0, 1, 3]
            .flatMap((i) => [0, 1, 2, 3].map((j) => K.box(6 + i * 23, 6 + j * 23, 6, 19, 19, 3)))
            .join(""),
      }),
      O("col", "slab", [52, 6, 6, 19, 88, 3], {
        x: [2, 3],
        lit: [1],
        draw: (K) => [0, 1, 2, 3].map((j) => K.box(52, 6 + j * 23, 6, 19, 19, 3)).join(""),
        top: [52, 6, 9, 19, 88],
      }),
      O("saved", "sheets", [140, -110, 0, 50, 50, 9], {
        lit: [1],
        pargs: [140, -110, 0, 50, 50, 3],
      }),
      O("gate", "gate", [160, -10, 0, 8, 110, 56], { lit: [2], pargs: [160, -10, 0, 110, 50] }),
      O("month", "server", [250, 20, 0, 50, 50, 40], { x: [3] }),
      O("map", "card", [210, 140, 0, 56, 48, 4], {
        lit: [3],
        pargs: [210, 140, 0, 56, 44],
        top: false,
      }),
    ],
    wires: [
      W(
        [
          [165, -60],
          [165, -10],
        ],
        { lit: [1] },
      ),
      W(
        [
          [100, 50],
          [160, 50],
        ],
        { lit: [2] },
      ),
      W(
        [
          [168, 45],
          [250, 45],
        ],
        { x: [3] },
      ),
      W(
        [
          [168, 95],
          [190, 95],
          [190, 144],
          [206, 144],
        ],
        { lit: [3] },
      ),
    ],
    marks: { 1: [50, 0, 22], 2: [164, -10, 76], 3: [238, 140, 66] },
  },
  translate: {
    dk: {
      cam: { proj: "obl", a: 35, k: 0.75 },
      asp: [1.3, 2.6],
      name: "oblique (cabinet) front view: faces drawn flat, depth up and to the right",
    },
    ph: { cam: { proj: "obl", a: 35, k: 0.75 }, asp: [1.0, 2.6], name: "oblique front view" },
    objs: [
      O("rule", "sheets", [0, 0, 0, 40, 50, 9], { lit: [1], pargs: [0, 0, 0, 40, 50, 3] }),
      O("ai", "chip", [80, 0, 0, 50, 50, 15], { lit: [1, 2], pargs: [80, 0, 0, 50] }),
      O("fn", "slab", [170, 0, 0, 50, 50, 16], { lit: [1], x: [2] }),
      O("check", "gate", [255, -5, 0, 8, 60, 46], { lit: [2, 3], pargs: [255, -5, 0, 60, 40] }),
      O("tries", "slab", [78, 80, 0, 56, 14, 8], {
        lit: [3],
        draw: (K) => [0, 1, 2, 3, 4].map((i) => K.box(78 + i * 11.5, 80, 0, 9, 14, 8, 2)).join(""),
      }),
      O("stub", "slab", [170, 110, 0, 50, 40, 16], { x: [4] }),
      O("others", "sheets", [270, 105, 0, 40, 46, 9], {
        lit: [4],
        pargs: [270, 105, 0, 40, 46, 3],
      }),
    ],
    wires: [
      W(
        [
          [40, 25],
          [80, 25],
        ],
        { lit: [1] },
      ),
      W(
        [
          [130, 25],
          [170, 25],
        ],
        { lit: [1] },
      ),
      W(
        [
          [220, 25],
          [255, 25],
        ],
        { lit: [2] },
      ),
      W(
        [
          [259, -5],
          [259, -30],
          [105, -30],
          [105, 0],
        ],
        { lit: [2] },
      ),
      W(
        [
          [105, 94],
          [105, 130],
          [170, 130],
        ],
        { lit: [] },
      ),
      W(
        [
          [220, 130],
          [270, 130],
        ],
        { lit: [4] },
      ),
    ],
    marks: { 1: [20, 0, 28], 2: [259, -5, 62], 3: [106, 87, 22], 4: [290, 128, 30] },
  },
  sandbox: {
    dk: { cam: { yaw: 66, el: 64 }, asp: [0.85, 2.0], name: "high side view into the cutaway" },
    ph: { cam: { yaw: 66, el: 64 }, asp: [0.85, 2.0], name: "high side view into the cutaway" },
    objs: [
      O("callers", "slab", [-95, -40, 0, 34, 134, 22], {
        lit: [1],
        draw: (K) => [-40, 10, 60].map((y) => prim.server(K, -95, y, 0, 34, 34, 22)).join(""),
        top: false,
      }),
      O("walls", "slab", [0, -50, 0, 170, 150, 50], {
        lit: [1],
        c: [0, -50, 0],
        draw: (K) =>
          K.box(0, -50, 0, 170, 150, 4) +
          K.box(0, -50, 4, 170, 4, 46) +
          K.box(0, -50, 4, 4, 150, 46),
        top: false,
      }),
      O("mods", "slab", [120, -30, 4, 34, 50, 10], {
        lit: [2],
        draw: (K) =>
          [0, 1]
            .flatMap((i) =>
              [0, 1, 2].map((j) => K.box(120 + i * 18, -30 + j * 18, 4, 12, 12, 10, 2)),
            )
            .join(""),
        top: false,
      }),
      O("rule", "slab", [36, 10, 4, 54, 46, 16], { lit: [4] }),
      O("helper", "slab", [40, 68, 4, 30, 22, 10], { x: [4] }),
      O("denied", "slab", [60, 140, 0, 70, 22, 10], {
        x: [3, 4],
        draw: (K) => K.box(60, 140, 0, 26, 22, 10, 3) + K.box(104, 140, 0, 26, 22, 10, 3),
        top: [60, 140, 10, 70, 22],
      }),
    ],
    wires: [
      W(
        [
          [-61, -23],
          [0, -23],
        ],
        { lit: [1] },
      ),
      W(
        [
          [-61, 27],
          [0, 27],
        ],
        { lit: [1] },
      ),
      W(
        [
          [-61, 77],
          [0, 77],
        ],
        { lit: [1] },
      ),
      W(
        [
          [95, 140],
          [95, 100],
        ],
        { x: [3, 4] },
      ),
    ],
    marks: { 1: [-78, -40, 40], 2: [137, -30, 30], 3: [95, 162, 26], 4: [63, 10, 36] },
  },
};
