/*
 * Highlights scenes for Ecom (payment, admin, store): highlights v2, flow version
 * (HIGHLIGHTS-SPEC v2 §1, §2.5). Port of the prototype's build/scenes.mjs. 5–7 parts per scene, no
 * words in the drawing, one numbered marker per step; the step sentences are in data.ts (flow.steps).
 * Drawn at build time with the iso-glow kernel (MIT, see src/lib/iso/LICENSE-iso-glow).
 */
import { O, W, type FlowScene } from "~/lib/iso/flow";

export const SCENES: Record<string, FlowScene> = {
  payment: {
    dk: { cam: { yaw: 52, el: 56 }, asp: [1.0, 2.0], name: "high corner view" },
    ph: { cam: { yaw: 52, el: 56 }, asp: [0.9, 2.0], name: "high corner view" },
    objs: [
      O("checkout", "card", [0, 0, 0, 44, 12, 44], {
        lit: [1],
        pargs: [0, 0, 0, 44, 40],
        top: false,
      }),
      O("cod", "slab", [0, 70, 0, 40, 24, 6], {
        lit: [1],
        draw: (K) => K.box(0, 70, 0, 40, 24, 6, 4),
      }),
      O("payos", "chip", [90, -5, 0, 50, 50, 15], { lit: [1, 2], pargs: [90, -5, 0, 50] }),
      O("match", "gate", [190, -10, 0, 8, 70, 46], { lit: [2], pargs: [190, -10, 0, 70, 40] }),
      O("machine", "server", [250, -5, 0, 56, 60, 34], { lit: [3] }),
      O("paid", "slab", [263, 10, 34, 30, 30, 5], {
        lit: [3],
        draw: (K) => K.box(263, 10, 34, 30, 30, 5, 4),
      }),
      O("notice", "sheets", [120, 92, 0, 40, 30, 6], { x: [4], pargs: [120, 92, 0, 40, 30, 2] }),
      O("ret", "card", [196, 112, 0, 40, 12, 36], { x: [4], pargs: [196, 112, 0, 40, 32] }),
    ],
    wires: [
      W(
        [
          [44, 20],
          [90, 20],
        ],
        { lit: [1] },
      ),
      W(
        [
          [22, 12],
          [22, 70],
        ],
        { lit: [1] },
      ),
      W(
        [
          [140, 20],
          [190, 20],
        ],
        { lit: [2] },
      ),
      W(
        [
          [198, 25],
          [250, 25],
        ],
        { lit: [3] },
      ),
      W(
        [
          [160, 106],
          [194, 106],
          [194, 60],
        ],
        { x: [4] },
      ),
      W(
        [
          [240, 124],
          [278, 124],
          [278, 55],
        ],
        { x: [4] },
      ),
    ],
    marks: { 1: [22, 0, 58], 2: [194, -10, 66], 3: [278, 10, 52], 4: [140, 92, 22] },
  },
  admin: {
    dk: {
      cam: { proj: "obl", a: 50, k: 0.45 },
      asp: [1.5, 3.2],
      margin: 0.1,
      name: "oblique front view, wide shot: two doors, one engine",
    },
    ph: {
      cam: { yaw: 24, el: 74 },
      asp: [1.0, 2.0],
      name: "near top-down (phone: the oblique would be too thin)",
    },
    objs: [
      O("buyer", "cyl", [-62, 8, 0, 22, 30, 30], { lit: [1], pargs: [-62, 8, 0, 22, 30] }),
      O("store", "panel", [0, 0, 0, 70, 5, 56], { lit: [1], pargs: [0, 0, 0, 70, 56], top: false }),
      O("door", "gate", [-56, 96, 0, 8, 40, 40], { lit: [2], pargs: [-56, 96, 0, 40, 36] }),
      O("desk", "panel", [0, 100, 0, 70, 5, 56], {
        lit: [2],
        pargs: [0, 100, 0, 70, 56],
        top: false,
      }),
      O("engine", "slab", [140, 20, 0, 80, 90, 14], {
        lit: [3],
        draw: (K) =>
          K.box(140, 20, 0, 80, 90, 6) +
          [0, 1]
            .flatMap((i) => [0, 1, 2].map((j) => K.box(148 + i * 36, 28 + j * 27, 6, 28, 20, 8, 3)))
            .join(""),
      }),
      O("ghost", "slab", [262, 110, 0, 40, 40, 14], { x: [3] }),
    ],
    wires: [
      W(
        [
          [-40, 20],
          [0, 20],
        ],
        { lit: [1] },
      ),
      W(
        [
          [-48, 116],
          [0, 116],
        ],
        { lit: [2] },
      ),
      W(
        [
          [70, 3],
          [104, 3],
          [104, 50],
          [140, 50],
        ],
        { lit: [3] },
      ),
      W(
        [
          [70, 103],
          [104, 103],
          [104, 80],
          [140, 80],
        ],
        { lit: [3] },
      ),
      W(
        [
          [70, 132],
          [262, 132],
        ],
        { x: [3] },
      ),
    ],
    marks: { 1: [35, 0, 72], 2: [-52, 96, 56], 3: [180, 20, 30] },
  },
  store: {
    dk: {
      cam: { yaw: 84, el: 34 },
      asp: [1.0, 2.0],
      name: "steep side view, the shops line up across the frame",
    },
    ph: { cam: { yaw: 84, el: 34 }, asp: [0.9, 2.0], name: "steep side view" },
    objs: [
      O("engine", "slab", [120, 0, 0, 110, 76, 8], {
        lit: [1],
        draw: (K) =>
          K.box(120, 0, 0, 110, 76, 6) +
          [0, 1, 2]
            .flatMap((i) => [0, 1].map((j) => K.box(128 + i * 34, 8 + j * 32, 6, 26, 26, 8, 3)))
            .join(""),
      }),
      O("checkout", "slab", [196, 40, 6, 26, 26, 8], {
        lit: [1],
        draw: (K) => K.box(196, 40, 6, 26, 26, 8, 3),
      }),
      O("mirror", "slab", [0, -40, 0, 60, 60, 44], {
        lit: [2],
        draw: (K) => K.box(0, -40, 0, 60, 5, 44) + K.box(0, -10, 0, 60, 5, 44),
        top: false,
      }),
      O("page", "panel", [0, 20, 0, 60, 5, 44], {
        lit: [3],
        pargs: [0, 20, 0, 60, 44],
        top: false,
      }),
      O("next", "slab", [0, 100, 0, 60, 60, 44], {
        lit: [2],
        draw: (K) => K.box(0, 100, 0, 60, 5, 44) + K.box(0, 130, 0, 60, 5, 44),
        top: false,
      }),
    ],
    wires: [
      W(
        [
          [60, -20],
          [90, -20],
          [90, 20],
          [120, 20],
        ],
        { lit: [2] },
      ),
      W(
        [
          [60, 132],
          [90, 132],
          [90, 60],
          [120, 60],
        ],
        { lit: [2] },
      ),
      W(
        [
          [60, 24],
          [105, 24],
          [105, 96],
          [209, 96],
          [209, 66],
        ],
        { x: [3] },
      ),
    ],
    marks: { 1: [150, 21, 14], 2: [30, 100, 54], 3: [30, 20, 54] },
  },
};
