/*
 * Highlights scenes for OpenPortfo (agent, news, email): highlights v2, flow version
 * (HIGHLIGHTS-SPEC v2 §1, §2.5). Port of the prototype's build/scenes.mjs. 5–7 parts per scene, no
 * words in the drawing, one numbered marker per step; the step sentences are in data.ts (flow.steps).
 * Drawn at build time with the iso-glow kernel (MIT, see src/lib/iso/LICENSE-iso-glow).
 */
import { O, W, type FlowScene } from "~/lib/iso/flow";

export const SCENES: Record<string, FlowScene> = {
  agent: {
    dk: { cam: { yaw: 40, el: 84 }, asp: [1.0, 2.0], name: "top-down plan" },
    ph: { cam: { yaw: 40, el: 84 }, asp: [0.9, 2.0], name: "top-down plan" },
    objs: [
      O("chat", "card", [0, 0, 0, 44, 12, 50], { lit: [1], pargs: [0, 0, 0, 44, 46], top: false }),
      O("agent", "chip", [80, -5, 0, 48, 48, 15], { lit: [2], pargs: [80, -5, 0, 48] }),
      O("tools", "server", [170, -10, 0, 56, 56, 34], { lit: [2, 3] }),
      O("key", "key", [178, -62, 0, 36, 14, 5], {}),
      O("book", "sheets", [270, -10, 0, 50, 56, 9], { lit: [3], pargs: [270, -10, 0, 50, 56, 3] }),
      O("other", "sheets", [270, 80, 0, 50, 40, 6], { x: [3, 4], pargs: [270, 80, 0, 50, 40, 2] }),
      O("reply", "card", [0, 100, 0, 44, 12, 36], {
        lit: [4],
        pargs: [0, 100, 0, 44, 32],
        top: false,
      }),
    ],
    wires: [
      W(
        [
          [44, 20],
          [80, 20],
        ],
        { lit: [1] },
      ),
      W(
        [
          [128, 20],
          [170, 20],
        ],
        { lit: [2] },
      ),
      W(
        [
          [226, 18],
          [270, 18],
        ],
        { lit: [3] },
      ),
      W(
        [
          [226, 40],
          [248, 40],
          [248, 100],
          [270, 100],
        ],
        { x: [3, 4] },
      ),
      W(
        [
          [178, -55],
          [104, -55],
          [104, -5],
        ],
        { x: [2, 3, 4] },
      ),
      W(
        [
          [198, 46],
          [198, 118],
          [48, 118],
        ],
        { lit: [4] },
      ),
    ],
    marks: { 1: [22, 0, 58], 2: [104, -5, 30], 3: [295, -10, 26], 4: [22, 100, 44] },
  },
  news: {
    dk: {
      cam: { yaw: 6, el: 26 },
      asp: [1.6, 3.8],
      margin: 0.08,
      name: "low front view, wide panorama",
    },
    ph: {
      cam: { yaw: 12, el: 58 },
      asp: [1.0, 2.2],
      name: "high front view (phone: the panorama would be too thin)",
    },
    objs: [
      O("feeds", "slab", [0, -40, 0, 30, 104, 36], {
        lit: [1],
        draw: (K) => [-40, -5, 30].map((y) => K.box(0, y, 0, 30, 4, 36)).join(""),
        top: false,
      }),
      O("job", "server", [80, -15, 0, 50, 50, 36], { lit: [1] }),
      O("items", "cyl", [160, -10, 0, 40, 40, 36], { lit: [1], pargs: [160, -10, 0, 40, 36] }),
      O("book", "sheets", [236, 80, 0, 44, 40, 9], { lit: [2], pargs: [236, 80, 0, 44, 40, 3] }),
      O("list", "card", [250, 30, 0, 50, 12, 40], {
        lit: [2, 3],
        pargs: [250, 30, 0, 50, 40],
        top: false,
      }),
      O("browser", "panel", [340, 10, 0, 70, 5, 52], {
        lit: [3],
        pargs: [340, 10, 0, 70, 52],
        top: false,
      }),
    ],
    wires: [
      W(
        [
          [30, 10],
          [80, 10],
        ],
        { lit: [1] },
      ),
      W(
        [
          [130, 10],
          [160, 10],
        ],
        { lit: [1] },
      ),
      W(
        [
          [200, 10],
          [224, 10],
          [224, 36],
          [246, 36],
        ],
        { lit: [2] },
      ),
      W(
        [
          [258, 80],
          [258, 42],
        ],
        { lit: [2] },
      ),
      W(
        [
          [304, 36],
          [322, 36],
          [322, 12],
          [340, 12],
        ],
        { lit: [3] },
      ),
      W(
        [
          [375, 10],
          [375, -100],
          [15, -100],
          [15, -40],
        ],
        { x: [3] },
      ),
    ],
    marks: { 1: [105, 10, 40], 2: [258, 100, 22], 3: [375, 10, 66] },
  },
  email: {
    dk: {
      cam: { yaw: 70, el: 44 },
      asp: [0.95, 2.0],
      name: "side view, the email builds toward the viewer",
    },
    ph: { cam: { yaw: 70, el: 44 }, asp: [0.9, 2.0], name: "side view" },
    objs: [
      O("job", "server", [0, -5, 0, 50, 50, 36], { lit: [1] }),
      O("optin", "slab", [5, 75, 0, 40, 18, 6], {
        lit: [1],
        draw: (K) => K.box(5, 75, 0, 40, 18, 6, 9) + K.box(27, 78, 6, 12, 12, 4, 6),
      }),
      O("perf", "slab", [104, -80, 0, 30, 20, 26], {
        lit: [2],
        draw: (K) => [10, 18, 26].map((h, i) => K.box(104 + i * 10, -80, 0, 7, 20, h)).join(""),
        top: false,
      }),
      O("price", "slab", [146, -80, 0, 22, 22, 12], {
        lit: [2],
        draw: (K) => K.box(146, -80, 0, 22, 22, 6, 3) + K.box(146, -80, 6, 22, 22, 6, 3),
        top: false,
      }),
      O("news", "sheets", [180, -84, 0, 26, 30, 9], { lit: [2], pargs: [180, -84, 0, 26, 30, 3] }),
      O("mail", "slab", [100, -10, 0, 110, 44, 8], {
        lit: [2],
        draw: (K) =>
          K.box(100, -10, 0, 110, 44, 8) +
          `<g transform="${K.TOP(100, -10, 8)}"><path class="ln" d="M0 0L55 22L110 0"/></g>`,
      }),
      O("site", "panel", [262, 10, 0, 64, 5, 44], {
        lit: [3],
        pargs: [262, 10, 0, 64, 44],
        top: false,
      }),
    ],
    wires: [
      W(
        [
          [25, 45],
          [25, 75],
        ],
        { lit: [1] },
      ),
      W(
        [
          [50, 15],
          [100, 15],
        ],
        { lit: [1, 2] },
      ),
      W(
        [
          [119, -60],
          [119, -10],
        ],
        { lit: [2] },
      ),
      W(
        [
          [157, -58],
          [157, -10],
        ],
        { lit: [2] },
      ),
      W(
        [
          [193, -54],
          [193, -10],
        ],
        { lit: [2] },
      ),
      W(
        [
          [262, 14],
          [210, 14],
        ],
        { x: [3] },
      ),
    ],
    marks: { 1: [25, 20, 36], 2: [155, 12, 8], 3: [294, 10, 60] },
  },
};
