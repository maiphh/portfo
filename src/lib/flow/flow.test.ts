import { describe, expect, it } from "vitest";
import {
  crossedBoxes,
  edgeGeom,
  edgeGeomV,
  edgeGeomY,
  LANES3_MIN,
  listBelow,
  onBorder,
  pathPoints,
  type Box,
} from "./geometry";
import { flowProblems, laneCounts, richText, type FlowNode } from "./types";

const box = (left: number, top: number, w = 150, h = 64): Box => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

describe("listBelow", () => {
  it("is cols × 150 + gaps + padding (flow spec)", () => {
    expect(listBelow(4)).toBe(4 * 150 + 3 * 24 + 56);
    expect(listBelow(1)).toBe(206);
  });
});

describe("edgeGeom", () => {
  it("draws a vertical line between nodes in the same column", () => {
    const top = box(0, 0);
    const low = box(0, 200);
    const g = edgeGeom(low, top);
    expect(g.d).toBe("M75 200 V64");
    expect(g.from).toEqual([75, 200]);
    expect(g.to).toEqual([75, 64]);
    expect(onBorder(g.from, low) && onBorder(g.to, top)).toBe(true);
  });

  it("curves from the right edge of the left node to the left edge of the right one", () => {
    const a = box(0, 100);
    const b = box(300, 0);
    const g = edgeGeom(a, b);
    // Off-level: each end moves 12px (PORT_Y) from the side's middle towards the other box.
    expect(g.from).toEqual([150, 120]);
    expect(g.to).toEqual([300, 44]);
    expect(g.d).toBe("M150 120 C225 120 225 44 300 44");
    expect(onBorder(g.from, a) && onBorder(g.to, b)).toBe(true);
  });

  it("gives a level edge and an off-level one into the same side separate ports", () => {
    const hub = box(300, 100);
    const level = edgeGeom(box(0, 100), hub);
    const below = edgeGeom(box(0, 300), hub);
    expect(level.to).toEqual([300, 132]);
    expect(below.to).toEqual([300, 144]);
  });

  it("keeps from/to in argument order when the source is on the right", () => {
    const g = edgeGeom(box(300, 0), box(0, 0));
    expect(g.from).toEqual([300, 32]);
    expect(g.to).toEqual([150, 32]);
  });
});

describe("onBorder", () => {
  it("accepts points on the border and rejects ones inside or away", () => {
    const b = box(10, 10, 100, 50);
    expect(onBorder([10, 30], b)).toBe(true);
    expect(onBorder([60, 60], b)).toBe(true);
    expect(onBorder([60, 30], b)).toBe(false);
    expect(onBorder([200, 30], b)).toBe(false);
  });
});

let seq = 0;
/** A node; its phone placement defaults to a fresh row in lane 1. */
const node = (
  id: string,
  at: [number, number],
  title = id,
  mAt: [number, number] | null = [++seq, 1],
  mAt2?: [number, number],
): FlowNode => ({
  id,
  title,
  at,
  ...(mAt && { mAt }),
  ...(mAt2 && { mAt2 }),
  details: { does: "", tech: [], why: "" },
});

describe("flowProblems", () => {
  it("passes valid data", () => {
    expect(flowProblems([node("a", [1, 1]), node("b", [1, 2])], [["a", "b"]], 2)).toEqual([]);
  });

  it("reports unknown ids, shared cells, columns and long titles", () => {
    const p = flowProblems(
      [node("a", [1, 1]), node("b", [1, 1]), node("c", [1, 3], "x".repeat(29))],
      [["a", "z"]],
      2,
    );
    expect(p).toEqual([
      "two nodes in cell 1/1",
      'node "c" is outside the 2 columns',
      'node "c": title over 28 chars',
      'edge a→z: no node "z"',
    ]);
  });
});

describe("flowProblems with groups", () => {
  it("accepts known groups and reports unknown or long ones", () => {
    const a = { ...node("a", [1, 1]), group: "api" };
    const b = { ...node("b", [1, 2]), group: "nope" };
    expect(flowProblems([a], [], 2, { api: "FastAPI process" })).toEqual([]);
    expect(flowProblems([a, b], [["a", "b", "dotted"]], 2, { api: "x".repeat(25) })).toEqual([
      'group "api": label over 24 chars',
      'node "b": no group "nope"',
    ]);
  });
});

describe("edgeGeomV (phone lanes)", () => {
  const W = 120;
  const H = 56;
  const cell = (lane: number, row: number) => box(14 + (lane - 1) * (W + 16), row * 84, W, H);

  it("joins the facing edges of two nodes in the same lane with a vertical line", () => {
    const a = cell(1, 0);
    const b = cell(1, 1);
    const g = edgeGeomV(a, b);
    expect(g.d).toBe("M74 56 V84");
    expect(onBorder(g.from, a) && onBorder(g.to, b)).toBe(true);
  });

  it("curves down from the bottom of one lane into the top of the next", () => {
    const a = cell(2, 0);
    const b = cell(1, 1);
    const g = edgeGeomV(a, b);
    // A diagonal's ports sit 20px (PORT) off-centre towards the other box, so it doesn't merge
    // with a straight edge into the same top (home: Cron Trigger and the browser → Worker).
    expect(g.from).toEqual([190, 56]);
    expect(g.to).toEqual([94, 84]);
    expect(g.d).toBe("M190 56 C190 70 94 70 94 84");
    expect(onBorder(g.from, a) && onBorder(g.to, b)).toBe(true);
    const straight = edgeGeomV(cell(1, 0), b);
    expect(straight.to).toEqual([74, 84]);
  });

  it("points up when the target is above, and keeps argument order", () => {
    const a = cell(1, 2);
    const b = cell(2, 1);
    const g = edgeGeomV(a, b);
    expect(g.from).toEqual([94, 168]);
    expect(g.to).toEqual([190, 140]);
    expect(onBorder(g.from, a) && onBorder(g.to, b)).toBe(true);
  });

  it("is a horizontal line between nodes in the same row", () => {
    const a = cell(2, 1);
    const b = cell(1, 1);
    const g = edgeGeomV(a, b);
    expect(g.d).toBe("M150 112 H134");
    expect(onBorder(g.from, a) && onBorder(g.to, b)).toBe(true);
  });

  it("routes along `via` (a gutter or the outer margin) with rounded corners", () => {
    const a = cell(2, 0);
    const b = cell(1, 3);
    const g = edgeGeomV(a, b, 142);
    expect(g.from).toEqual([150, 28]);
    expect(g.to).toEqual([134, 280]);
    expect(g.d).toBe("M150 28 H148 Q142 28 142 34 V274 Q142 280 136 280 H134");
    expect(onBorder(g.from, a) && onBorder(g.to, b)).toBe(true);
    // Outer margin, same lane: out of the left side and back into the left side.
    const o = edgeGeomV(cell(1, 0), cell(1, 2), 5);
    expect(o.from).toEqual([14, 28]);
    expect(o.to).toEqual([14, 196]);
    expect(onBorder(o.from, cell(1, 0)) && onBorder(o.to, cell(1, 2))).toBe(true);
  });

  it("every endpoint lies on its node's border, whatever the pair", () => {
    for (const [la, ra, lb, rb] of [
      [1, 0, 3, 1],
      [3, 4, 1, 0],
      [2, 2, 2, 0],
      [3, 1, 2, 1],
    ] as const) {
      const a = cell(la, ra);
      const b = cell(lb, rb);
      for (const g of [edgeGeomV(a, b), edgeGeomV(a, b, 300)]) {
        expect(onBorder(g.from, a)).toBe(true);
        expect(onBorder(g.to, b)).toBe(true);
      }
    }
  });

  it("3 lanes start at a 480px viewport's flow width (phones get 2)", () => {
    expect(LANES3_MIN).toBe(438);
  });
});

describe("edgeGeomY (along a row gutter)", () => {
  const cell = (lane: number, row: number) => box(14 + (lane - 1) * 136, row * 84, 120, 56);

  it("leaves the bottom, runs along the gutter with rounded corners, enters the top", () => {
    const a = cell(1, 0);
    const b = cell(2, 2);
    const g = edgeGeomY(a, b, 70);
    expect(g.d).toBe("M94 56 V64 Q94 70 100 70 H184 Q190 70 190 76 V168");
    expect(onBorder(g.from, a) && onBorder(g.to, b)).toBe(true);
  });

  it("uses the tops of both boxes when the gutter is above them", () => {
    const a = cell(1, 2);
    const b = cell(2, 2);
    const g = edgeGeomY(a, b, 154);
    expect(g.from[1]).toBe(168);
    expect(g.to[1]).toBe(168);
    expect(onBorder(g.from, a) && onBorder(g.to, b)).toBe(true);
  });
});

describe("pathPoints / crossedBoxes", () => {
  it("samples lines and curves", () => {
    expect(pathPoints("M0 0 H9")).toEqual([
      [0, 0],
      [3, 0],
      [6, 0],
      [9, 0],
    ]);
    const q = pathPoints("M0 0 Q10 0 10 10");
    expect(q.at(-1)).toEqual([10, 10]);
    const c = pathPoints("M0 0 C0 5 10 5 10 10");
    expect(c.at(-1)).toEqual([10, 10]);
  });

  it("finds the boxes a path passes through, not ones it only touches", () => {
    const boxes = [box(100, 0, 50, 100), box(100, 200), box(300, 50, 50, 50)];
    expect(crossedBoxes("M0 50 H300", boxes)).toEqual([0]);
    // Running along a box's border is not a crossing.
    expect(crossedBoxes("M0 200 H400", boxes)).toEqual([]);
  });
});

describe("flowProblems: phone layouts", () => {
  const n = (
    id: string,
    mAt: [number, number] | null,
    mAt2?: [number, number],
    group?: string,
  ) => ({
    ...node(id, [1, Number(id.replace(/\D/g, "")) || 1], id, mAt, mAt2),
    ...(group && { group }),
  });

  it("rejects a node with no phone placement", () => {
    expect(flowProblems([n("a1", [1, 1]), n("b2", null)], [], 2)).toEqual([
      'node "b2": no phone placement (mAt)',
    ]);
  });

  it("rejects shared phone cells and lanes out of range", () => {
    expect(flowProblems([n("a1", [1, 1]), n("b2", [1, 1]), n("c3", [2, 0])], [], 3)).toEqual([
      'mAt: "a1" and "b2" share phone cell 1/1',
      'node "c3": mAt 2/0 is outside rows ≥ 1 and lanes 1–3',
    ]);
  });

  it("needs a 2-lane mAt2 for every node when mAt uses 3 lanes, without overlaps", () => {
    expect(
      flowProblems([n("a1", [1, 1], [1, 1]), n("b2", [1, 3], [1, 1]), n("c3", [2, 2])], [], 3),
    ).toEqual([
      'mAt2: "a1" and "b2" share phone cell 1/1',
      'node "c3": no 2-lane placement (mAt2), and mAt uses 3 lanes',
    ]);
    expect(flowProblems([n("a1", [1, 1], [1, 3]), n("b2", [1, 3], [2, 1])], [], 3)).toEqual([
      'node "a1": mAt2 1/3 is outside rows ≥ 1 and lanes 1–2',
    ]);
    expect(flowProblems([n("a1", [1, 1], [1, 1]), n("b2", [1, 2])], [], 2)).toEqual([
      'node "a1": mAt2 is only for layouts that use 3 lanes',
    ]);
  });

  it("rejects a non-member inside a group's phone box", () => {
    const g = { api: "API" };
    expect(
      flowProblems(
        [n("a1", [1, 1], undefined, "api"), n("b2", [2, 1]), n("c3", [3, 2], undefined, "api")],
        [],
        3,
        g,
      ),
    ).toEqual(['mAt: "b2" sits inside group "api"']);
  });

  it("counts lanes for both layouts", () => {
    expect(laneCounts([n("a1", [1, 3], [1, 2]), n("b2", [2, 1], [2, 1])])).toEqual({
      lanes: 3,
      lanes2: 2,
    });
    expect(laneCounts([n("a1", [1, 2]), n("b2", [2, 1])])).toEqual({ lanes: 2, lanes2: 2 });
  });
});

describe("richText", () => {
  it("escapes HTML and turns backticks into code", () => {
    expect(richText("a <b> `x<y`")).toBe("a &lt;b&gt; <code>x&lt;y</code>");
  });
});
