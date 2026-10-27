/** Every Highlights scene against its plate copy: the step counts match the read-out, both
 * cameras draw the same labels, and the build-time (end) state is finished and well-formed. */
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
import type { PlateScene } from "./scene";

const cases: [string, CaseStudyData, Record<string, PlateScene>][] = [
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

describe.each(cases)("%s", (_slug, d, scenes) => {
  it("has a scene for every dive and no stray scenes", () => {
    expect(Object.keys(scenes).sort()).toEqual(d.dives.map((x) => x.id).sort());
    for (const dive of d.dives) expect(dive.plate, dive.id).toBeDefined();
  });
});

describe.each(rows)("$name", ({ dive, scene }) => {
  const plate = dive.plate;
  if (!plate || !scene) throw new Error("missing plate or scene");
  const dk = scene.draw(false, scene.cam.dk);
  const ph = scene.draw(true, scene.cam.ph);
  const rd = dk.render(scene.asp[0], 0.05, 760);
  const rp = ph.render(scene.asp[1], 0.05, 300);

  it("counts one step per read-out line in every mode", () => {
    const modes = plate.modes?.map((m) => m[0]) ?? ["d"];
    expect(Object.keys(dk.n).sort()).toEqual([...modes].sort());
    for (const m of modes) {
      expect(dk.n[m], m).toBe(plate.read[m]?.length);
      expect(ph.n[m], m).toBe(dk.n[m]);
      for (const line of plate.read[m] ?? []) expect(line.trim()).not.toBe("");
    }
    expect(dk.mode).toBe(plate.mode ?? "d");
  });

  it("ends with its labels shown and both cameras drawing the same labels", () => {
    expect(rd.labels.filter((l) => l.on).length).toBeGreaterThan(0);
    expect(rp.labels.map((l) => l.t)).toEqual(rd.labels.map((l) => l.t));
    expect(rp.labels.map((l) => l.on)).toEqual(rd.labels.map((l) => l.on));
  });

  it("draws well-formed markup", () => {
    for (const r of [rd, rp]) {
      expect(r.svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(r.html).not.toMatch(/NaN|undefined|Infinity/);
      expect(r.svg).toContain('class="it"');
      // Tips are copy: never empty.
      for (const m of r.html.matchAll(/data-tip="([^"]*)"/g)) expect(m[1]?.trim()).not.toBe("");
    }
  });
});

it("POET's wall names an anonymous donor “Một nhà hảo tâm”", () => {
  expect(ANON).toBe("Một nhà hảo tâm");
  const wall = POET.wall ?? Object.values(POET).at(-1);
  if (!wall) throw new Error("no POET scene");
  const r = wall.draw(false, wall.cam.dk).render(wall.asp[0], 0.05, 760);
  expect(r.html).toContain(ANON);
  expect(r.html).not.toContain("Ẩn danh</b>");
});
