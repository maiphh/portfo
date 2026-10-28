/** Highlights v3 drawings (HIGHLIGHTS-SPEC v3 §2, §4, §5.2): every dive on the six case studies has
 * one scene and one loop; each scene is one static SVG of the given size, hidden from screen readers,
 * with every class namespaced `hl-`; every loop selector finds parts in its scene; loops tween only
 * transform and opacity. */
import { describe, expect, it } from "vitest";
import { dvp } from "~/case-studies/data-validation/data";
import { ocr } from "~/case-studies/document-ocr/data";
import { ecom } from "~/case-studies/ecom/data";
import { legalRag } from "~/case-studies/legal-rag/data";
import { openportfo } from "~/case-studies/openportfo/data";
import { poet } from "~/case-studies/poet/data";
import type { CaseStudyData } from "~/lib/case";
import MOTION from "./motion.json";
import { PAGE_KEY, scene } from "./index";

const cases: [string, CaseStudyData][] = [
  ["document-ocr", ocr],
  ["legal-rag", legalRag],
  ["data-validation", dvp],
  ["openportfo", openportfo],
  ["ecom", ecom],
  ["poet", poet],
];
/** viewBox heights (spec §4); the width is always 300. */
const H: Record<string, number> = {
  "ocr/template": 165,
  "ocr/queue": 213,
  "ocr/api": 246,
  "rag/repair": 248,
  "rag/fallback": 250,
  "rag/refuse": 250,
  "dvp/validate": 212,
  "dvp/translate": 226,
  "dvp/sandbox": 255,
  "openportfo/agent": 312,
  "openportfo/news": 222,
  "openportfo/email": 218,
  "ecom/payment": 176,
  "ecom/admin": 222,
  "ecom/store": 230,
  "poet/donate": 256,
  "poet/wall": 268,
};
interface Track {
  t: string[];
  opacity?: unknown[];
  transform?: [number, Record<string, number>][];
  origin?: Record<string, string>;
}
const M = MOTION as unknown as Record<
  string,
  { L: number; tracks: Track[]; delay?: [string, unknown][] }
>;
const rows = cases.flatMap(([slug, d]) =>
  d.dives.map((dive) => ({ name: `${slug}/${dive.id}`, slug, dive })),
);
const classes = (svg: string) =>
  new Set([...svg.matchAll(/class="([^"]*)"/g)].flatMap((m) => (m[1] ?? "").split(/\s+/)));
const selClasses = (sel: string) => [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1] ?? "");

it("has 17 scenes and 17 loops, one per dive, and no strays", () => {
  const keys = rows.map((r) => scene(r.slug, r.dive.id)?.key).sort();
  expect(keys).toEqual(Object.keys(H).sort());
  expect(Object.keys(M).sort()).toEqual(Object.keys(H).sort());
  expect(Object.keys(PAGE_KEY).sort()).toEqual(cases.map(([s]) => s).sort());
});

describe.each(rows)("$name", ({ slug, dive }) => {
  const sc = scene(slug, dive.id);
  const svg = sc?.svg ?? "";
  const key = sc?.key ?? "";
  it("is one static SVG, 300 wide, hidden from screen readers", () => {
    const root = svg.match(/^<svg [^>]*>/)?.[0] ?? "";
    expect(root).toContain(`class="hl-fig hl-s-${key.replace("/", "-")}"`);
    expect(root).toContain(`data-scene="${key}"`);
    expect(root).toContain(`viewBox="0 0 300 ${H[key]}"`);
    expect(root).toContain('aria-hidden="true"');
    expect(root).toContain('focusable="false"');
    expect(svg.match(/<svg[\s>]/g)).toHaveLength(1);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toMatch(/<(script|style|a|foreignObject|image|animate)\b|on\w+="|href=/i);
  });
  it("namespaces every class hl-", () => {
    for (const c of classes(svg)) expect(c).toMatch(/^hl-/);
  });
  it("has a point and a caption", () => {
    expect(dive.point.trim().length).toBeGreaterThan(20);
    expect(dive.shows.trim().length).toBeGreaterThan(10);
  });
  it("has a loop whose selectors all find parts, tweening transform and opacity only", () => {
    const m = M[key];
    expect(m).toBeDefined();
    if (!m) return;
    expect(m.L).toBeGreaterThan(0);
    const have = classes(svg);
    for (const tr of m.tracks) {
      for (const sel of tr.t) for (const c of selClasses(sel)) expect(have, `${sel}`).toContain(c);
      for (const [, v] of tr.transform ?? [])
        for (const p of Object.keys(v))
          expect(["x", "y", "scaleX", "scaleY", "rotation"]).toContain(p);
      expect(
        Object.keys(tr).every((k) =>
          ["t", "p", "ease", "opacity", "transform", "origin", "base"].includes(k),
        ),
      ).toBe(true);
    }
    for (const [sel] of m.delay ?? []) for (const c of selClasses(sel)) expect(have).toContain(c);
  });
});
