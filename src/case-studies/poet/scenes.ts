/*
 * Highlights scenes for POET (donate, wall): highlights v2, flow version
 * (HIGHLIGHTS-SPEC v2 §1, §2.5). Port of the prototype's build/scenes.mjs. 5–7 parts per scene, no
 * words in the drawing, one numbered marker per step; the step sentences are in data.ts (flow.steps).
 * Drawn at build time with the iso-glow kernel (MIT, see src/lib/iso/LICENSE-iso-glow).
 */
import { O, W, lines, type FlowScene } from "~/lib/iso/flow";

/** What the wall shows for an anonymous gift (“Ẩn danh” ticked); flow step 3 names it. */
export const ANON = "Một nhà hảo tâm";

export const SCENES: Record<string, FlowScene> = {
  donate: {
    dk: { cam: { yaw: 36, el: 52 }, asp: [1.2, 2.0], name: "raised three-quarter, front-weighted" },
    ph: { cam: { yaw: 36, el: 52 }, asp: [1.0, 2.0], name: "raised three-quarter" },
    objs: [
      O("form", "card", [0, 0, 0, 44, 8, 54], { lit: [1], pargs: [0, 0, 0, 44, 50], top: false }),
      O("worker", "server", [100, -10, 0, 54, 50, 40], { lit: [1, 3] }),
      O("payos", "chip", [215, -10, 0, 50, 50, 15], { lit: [2], pargs: [215, -10, 0, 50] }),
      O("gift", "slab", [112, 80, 0, 30, 30, 12], { lit: [3] }),
      O("receipt", "card", [0, 110, 0, 44, 8, 44], {
        lit: [4],
        pargs: [0, 110, 0, 44, 40],
        top: false,
      }),
    ],
    wires: [
      W(
        [
          [44, 10],
          [100, 10],
        ],
        { lit: [1] },
      ),
      W(
        [
          [154, 5],
          [215, 5],
        ],
        { lit: [1] },
      ),
      W(
        [
          [215, 25],
          [154, 25],
        ],
        { lit: [2] },
      ),
      W(
        [
          [127, 40],
          [127, 80],
        ],
        { lit: [3] },
      ),
      W(
        [
          [44, 118],
          [80, 118],
          [80, 95],
          [112, 95],
        ],
        { x: [4] },
      ),
    ],
    marks: { 1: [22, 4, 68], 2: [240, 15, 34], 3: [127, 95, 28], 4: [22, 114, 58] },
  },
  wall: {
    dk: {
      cam: { yaw: 2, el: 9 },
      asp: [1.5, 3.0],
      margin: 0.12,
      name: "flat front elevation, wide shot: the wall stands up",
    },
    ph: { cam: { yaw: 2, el: 9 }, asp: [1.2, 3.0], margin: 0.05, name: "flat front elevation" },
    objs: [
      O("gift", "slab", [0, 40, 0, 30, 30, 14], { lit: [1] }),
      O("admin", "gate", [80, 25, 0, 8, 60, 46], { lit: [2], pargs: [80, 25, 0, 60, 40] }),
      O("wall", "panel", [150, 0, 0, 160, 6, 100], { pargs: [150, 0, 0, 160, 100, 6], top: false }),
      O("c1", "slab", [166, 6, 30, 60, 3, 56], {
        draw: (K) =>
          K.box(166, 6, 30, 60, 3, 56) +
          lines(K, K.FRONT(166, 9, 86), 60, 56, [0.2, 0.4, 0.6, 0.8]),
        top: false,
      }),
      O("c2", "slab", [236, 6, 30, 60, 3, 56], {
        lit: [3],
        draw: (K) =>
          K.box(236, 6, 30, 60, 3, 56) +
          lines(K, K.FRONT(236, 9, 86), 60, 56, [0.2, 0.4, 0.6, 0.8]),
        top: false,
      }),
    ],
    wires: [
      W(
        [
          [30, 55],
          [80, 55],
        ],
        { lit: [2] },
      ),
      W(
        [
          [88, 55],
          [266, 55],
          [266, 9],
        ],
        { lit: [3] },
      ),
    ],
    marks: { 1: [15, 55, 30], 2: [84, 25, 64], 3: [266, 7, 104] },
  },
};
