/*
 * Highlights scenes for Document OCR (template, queue, api): highlights v2, flow version
 * (HIGHLIGHTS-SPEC v2 §1, §2.5). Port of the prototype's build/scenes.mjs. 5–7 parts per scene, no
 * words in the drawing, one numbered marker per step; the step sentences are in data.ts (flow.steps).
 * Drawn at build time with the iso-glow kernel (MIT, see src/lib/iso/LICENSE-iso-glow).
 */
import { O, W, type FlowScene } from "~/lib/iso/flow";

export const SCENES: Record<string, FlowScene> = {
  template: {
    dk: {
      cam: { yaw: 58, el: 12 },
      asp: [1.2, 2.0],
      margin: 0.04,
      crop: [0.07, 0.0, 0.93, 1.0],
      name: "low three-quarter, tight crop: the template layers fill the frame",
    },
    ph: {
      cam: { yaw: 58, el: 12 },
      asp: [1.0, 2.0],
      margin: 0.04,
      crop: [0.07, 0.0, 0.93, 1.0],
      name: "low three-quarter, tight crop",
    },
    objs: [
      O("tray", "slab", [-8, -8, 0, 106, 86, 5], { lit: [1] }),
      ...[0, 1, 2, 3].map((i) => O("L" + i, "tile", [0, 0, 22 + i * 20, 90, 70, 4], { lit: [2] })),
      O("pipe", "server", [180, 5, 0, 70, 60, 38], { lit: [3, 4] }),
      O("run", "sheets", [196, 22, 38, 34, 26, 2], { lit: [4], pargs: [196, 22, 38, 34, 26, 2] }),
    ],
    wires: [
      W(
        [
          [98, 35],
          [180, 35],
        ],
        { lit: [3] },
      ),
    ],
    marks: { 1: [98, 78, 5], 2: [0, 0, 92], 3: [215, 65, 0], 4: [213, 22, 60] },
  },
  queue: {
    dk: {
      cam: { yaw: 12, el: 80 },
      asp: [1.3, 2.4],
      name: "near top-down, lanes read like a plan",
    },
    ph: { cam: { yaw: 12, el: 80 }, asp: [1.0, 2.4], name: "near top-down" },
    objs: [
      O("A", "sheets", [0, -75, 0, 40, 50, 6], { lit: [1], pargs: [0, -75, 0, 40, 50, 5] }),
      O("B", "sheets", [0, -5, 0, 40, 30, 3], { lit: [1], pargs: [0, -5, 0, 40, 30, 1] }),
      O("C", "sheets", [0, 45, 0, 40, 30, 3], { lit: [1], pargs: [0, 45, 0, 40, 30, 1] }),
      O("render", "server", [95, -40, 0, 50, 80, 30], { lit: [2] }),
      O("tray", "slab", [195, -50, 0, 70, 100, 6], { lit: [3] }),
      O("slots", "slab", [205, -40, 6, 50, 80, 8], {
        lit: [4],
        draw: (K) => [-40, -10, 20].map((y) => K.box(212, y, 6, 36, 22, 8, 4)).join(""),
      }),
      O("model", "chip", [315, -25, 0, 50, 50, 15], { lit: [3, 4], pargs: [315, -25, 0, 50] }),
    ],
    wires: [
      W(
        [
          [40, -40],
          [70, -40],
          [70, 0],
          [95, 0],
        ],
        { lit: [2] },
      ),
      W(
        [
          [40, 10],
          [70, 10],
        ],
        { lit: [2] },
      ),
      W(
        [
          [40, 60],
          [70, 60],
          [70, 10],
        ],
        { lit: [2] },
      ),
      W(
        [
          [145, 0],
          [195, 0],
        ],
        { lit: [4] },
      ),
      W(
        [
          [265, 0],
          [315, 0],
        ],
        { lit: [3, 4] },
      ),
    ],
    marks: { 1: [20, -75, 50], 2: [120, -40, 48], 3: [340, 0, 34], 4: [230, -40, 32] },
  },
  api: {
    dk: {
      cam: { yaw: 88, el: 44 },
      asp: [1.0, 2.0],
      name: "steep side view, the flow turns down the frame",
    },
    ph: { cam: { yaw: 88, el: 44 }, asp: [0.9, 2.0], name: "steep side view" },
    objs: [
      O("sys", "server", [0, 0, 0, 50, 50, 42], { lit: [1] }),
      O("key", "key", [10, 80, 0, 36, 14, 5], { lit: [2] }),
      O("hash", "cyl", [70, 78, 0, 30, 30, 28], { lit: [2], pargs: [70, 78, 0, 30, 28] }),
      O("queues", "slab", [140, 0, 0, 80, 50, 14], {
        lit: [3],
        draw: (K) =>
          K.box(140, 0, 0, 80, 50, 6) +
          K.box(146, 6, 6, 68, 16, 8, 3) +
          K.box(146, 28, 6, 68, 16, 8, 3),
      }),
      O("wb", "sheets", [150, -100, 0, 50, 40, 9], { lit: [4], pargs: [150, -100, 0, 50, 40, 3] }),
    ],
    wires: [
      W(
        [
          [50, 25],
          [140, 25],
        ],
        { lit: [3] },
      ),
      W(
        [
          [46, 87],
          [70, 90],
        ],
        { lit: [2] },
      ),
      W(
        [
          [180, 0],
          [180, -60],
          [175, -60],
        ],
        { lit: [4] },
      ),
      W(
        [
          [150, -80],
          [25, -80],
          [25, 0],
        ],
        { lit: [4] },
      ),
    ],
    marks: { 1: [25, 0, 62], 2: [85, 93, 46], 3: [180, 25, 30], 4: [175, -100, 34] },
  },
};
