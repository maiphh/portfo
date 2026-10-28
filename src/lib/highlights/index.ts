/**
 * Highlights v3 drawings (HIGHLIGHTS-SPEC v3 §4): one static SVG per dive, the full scene at rest,
 * lifted from Portfo Designer's prototype (prototype-highlights-v3/handoff/scenes) with every class
 * namespaced `hl-`. The two iso scenes (OCR queue, DVP sandbox) are drawn at build time by
 * lib/iso/scenes.ts. The loops are in motion.json, played by src/scripts/case/flow.ts.
 */
import { ISO_SCENES, isoSvg } from "~/lib/iso/scenes";

const FLAT = import.meta.glob<string>("./scenes/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Case-study slug → the scene key's page part. */
export const PAGE_KEY: Record<string, string> = {
  "document-ocr": "ocr",
  "legal-rag": "rag",
  "data-validation": "dvp",
  openportfo: "openportfo",
  ecom: "ecom",
  poet: "poet",
};

export interface Scene {
  /** "<page>/<dive>", also the SVG's data-scene and the motion.json key. */
  key: string;
  svg: string;
  /** Drawn with the iso-glow kernel (MIT), so the page credits it. */
  iso: boolean;
}

/** The drawing for one dive, or undefined when there is none. */
export function scene(slug: string, dive: string): Scene | undefined {
  const page = PAGE_KEY[slug];
  if (!page) return undefined;
  const key = `${page}/${dive}`;
  const iso = ISO_SCENES[key];
  if (iso) return { key, svg: isoSvg(key, iso), iso: true };
  const svg = FLAT[`./scenes/${page}-${dive}.svg`];
  return svg ? { key, svg: svg.trim(), iso: false } : undefined;
}
