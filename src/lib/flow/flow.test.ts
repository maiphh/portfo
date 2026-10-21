import { describe, expect, it } from "vitest";
import { edgeGeom, listBelow, onBorder, type Box } from "./geometry";
import { flowProblems, richText, type FlowNode } from "./types";

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
    expect(g.from).toEqual([150, 132]);
    expect(g.to).toEqual([300, 32]);
    expect(g.d).toBe("M150 132 C225 132 225 32 300 32");
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

const node = (id: string, at: [number, number], title = id): FlowNode => ({
  id,
  title,
  at,
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

describe("richText", () => {
  it("escapes HTML and turns backticks into code", () => {
    expect(richText("a <b> `x<y`")).toBe("a &lt;b&gt; <code>x&lt;y</code>");
  });
});
