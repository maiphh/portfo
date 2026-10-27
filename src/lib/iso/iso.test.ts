/** Highlights scenes (flow version, HIGHLIGHTS-SPEC v2 §6.3) against their step copy: one marker
 * per step, phases in range, well-formed markup with no words in the drawing, markers clear of each
 * other and inside the frame, and distinct cameras on each page. */
import { describe, expect, it } from "vitest";
import type { CaseStudyData } from "~/lib/case";
import { dvp } from "~/case-studies/data-validation/data";
import { SCENES as DVP } from "~/case-studies/data-validation/scenes";
import { ocr } from "~/case-studies/document-ocr/data";
import { SCENES as OCR } from "~/case-studies/document-ocr/scenes";
import { ecom } from "~/case-studies/ecom/data";
import { SCENES as ECOM } from "~/case-studies/ecom/scenes";
import { legalRag } from "~/case-studies/legal-rag/data";
import { SCENES as RAG } from "~/case-studies/legal-rag/scenes";
import { openportfo } from "~/case-studies/openportfo/data";
import { SCENES as OPF } from "~/case-studies/openportfo/scenes";
import { ANON, SCENES as POET } from "~/case-studies/poet/scenes";
import { poet } from "~/case-studies/poet/data";
import { render, type FlowScene, type Rendered } from "./flow";
import { look } from "./iso";

const cases: [string, CaseStudyData, Record<string, FlowScene>][] = [
  ["document-ocr", ocr, OCR],
  ["legal-rag", legalRag, RAG],
  ["data-validation", dvp, DVP],
  ["openportfo", openportfo, OPF],
  ["ecom", ecom, ECOM],
  ["poet", poet, POET],
];

const rows = cases.flatMap(([slug, d, scenes]) =>
  d.dives.map((dive) => ({ name: `${slug}/${dive.id}`, dive, scene: scenes[dive.id] })),
);

const views = (sc: FlowScene, n: number) => ({
  dk: render(sc, { ...sc.dk, kind: "dk" }, n),
  ph: render(sc, { ...sc.ph, kind: "ph" }, n),
});

/** The drawing's aspect ratio, from its `aspect-ratio:W/H`. */
const aspect = (r: Rendered) => {
  const m = /aspect-ratio:([\d.]+)\/([\d.]+)/.exec(r.html);
  return m ? Number(m[1]) / Number(m[2]) : NaN;
};

/**
 * Marker pairs whose 26px circles overlap by more than 2px when the drawing is `w` px wide
 * (e2e checks the same in the browser; this is the unit-level twin and its negative control).
 */
const clashes = (r: Rendered, w: number): [number, number][] => {
  const h = w / aspect(r);
  const out: [number, number][] = [];
  r.marks.forEach((a, i) =>
    r.marks.slice(i + 1).forEach((b) => {
      const dx = Math.abs(a.lx - b.lx) * w;
      const dy = Math.abs(a.ty - b.ty) * h;
      if (dx < 24 && dy < 24) out.push([a.n, b.n]);
    }),
  );
  return out;
};

describe.each(cases)("%s", (_slug, d, scenes) => {
  it("has a scene for every dive and no stray scenes", () => {
    expect(Object.keys(scenes).sort()).toEqual(d.dives.map((x) => x.id).sort());
    for (const dive of d.dives) expect(dive.flow, dive.id).toBeDefined();
  });

  it.each(["dk", "ph"] as const)("uses a distinct camera for each scene (%s)", (v) => {
    const ls = Object.entries(scenes).map(([id, sc]) => ({ id, ...look(sc[v].cam) }));
    ls.forEach((a, i) =>
      ls.slice(i + 1).forEach((b) => {
        const pair = `${a.id}/${b.id}`;
        expect(Math.abs(a.yaw - b.yaw), `${pair} yaw`).toBeGreaterThanOrEqual(20);
        expect(Math.abs(a.el - b.el), `${pair} el`).toBeGreaterThanOrEqual(10);
      }),
    );
  });
});

describe.each(rows)("$name", ({ dive, scene }) => {
  const flow = dive.flow;
  if (!flow || !scene) throw new Error("missing flow copy or scene");
  const N = flow.steps.length;
  // render() throws if a marker leaves the (cropped) frame: 3–97% across, 4–96% down
  const r = views(scene, N);

  it("has one marker per step and phases in 1…N", () => {
    expect(Object.keys(scene.marks).map(Number).sort()).toEqual(
      Array.from({ length: N }, (_, i) => i + 1),
    );
    for (const t of flow.steps) expect(t.trim()).not.toBe("");
    if (flow.chips) expect(flow.chips[0]).toBeLessThanOrEqual(N);
    for (const o of [...scene.objs, ...scene.wires])
      for (const k of [...(o.lit ?? []), ...(o.x ?? [])]) {
        expect(k).toBeGreaterThanOrEqual(1);
        expect(k).toBeLessThanOrEqual(N);
      }
  });

  it("draws well-formed markup with no words in the drawing", () => {
    for (const v of [r.dk, r.ph]) {
      expect(v.html).not.toMatch(/NaN|undefined|Infinity/);
      expect(v.html).not.toContain("<text");
      expect(v.marks).toHaveLength(N);
      for (const m of v.marks) {
        expect(m.lx).toBeGreaterThanOrEqual(0.03);
        expect(m.lx).toBeLessThanOrEqual(0.97);
        expect(m.ty).toBeGreaterThanOrEqual(0.04);
        expect(m.ty).toBeLessThanOrEqual(0.96);
      }
    }
  });

  it("keeps markers apart at 320–430 (phone) and 1024–1440 (desktop)", () => {
    // the phone drawing at 320 has ~280px; the desktop one at 1024 ~560px (1.4fr column)
    expect(clashes(r.ph, 280)).toEqual([]);
    expect(clashes(r.dk, 560)).toEqual([]);
  });
});

it("the marker check catches a marker moved onto another (negative control)", () => {
  const sc = OCR.queue;
  if (!sc) throw new Error("no OCR queue scene");
  const one = sc.marks[1];
  if (!one) throw new Error("no marker 1");
  const moved: FlowScene = { ...sc, marks: { ...sc.marks, 2: [one[0] + 4, one[1], one[2]] } };
  const r = render(moved, { ...moved.dk, kind: "dk" }, 4);
  expect(clashes(r, 560)).toContainEqual([1, 2]);
});

it("POET's wall names an anonymous donor “Một nhà hảo tâm” in step 3", () => {
  expect(ANON).toBe("Một nhà hảo tâm");
  const wall = poet.dives.find((x) => x.id === "wall");
  expect(wall?.flow?.steps[2]).toContain(ANON);
});
