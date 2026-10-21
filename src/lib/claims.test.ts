/**
 * Claims guard for everything the site, the chat worker and their test fixtures say: content,
 * data, mocks, case-study data, the worker's corpus and its recorded/scripted fixtures.
 * - The old OCR figures (">98% accurate", ">90% of processing time saved") and the "built all
 *   three on my own" line stay out everywhere.
 * - The OCR results Phu approved (2026-10-21) are the ones in projects/ocr/README.md "## Result",
 *   word for word. (e2e/case-study.spec.ts checks the rendered pages.)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIRS = [
  "src/content",
  "src/data",
  "src/lib/mocks",
  "src/case-studies",
  "src/components",
  "workers/portfo/data",
  "workers/portfo/src",
  "workers/portfo/test",
];
const EXT = /\.(md|mdx|json|ts|astro)$/;

export const BANNED: [RegExp, string][] = [
  [/(^|[^\d.])98\s?%/, "98%"],
  [/>\s?90\s?%|90\s?% of (the )?processing/i, ">90% time saved"],
  [/all on my own|on his own/i, "solo for all three"],
];

function files(dir: string): string[] {
  const abs = join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(relative(ROOT, p));
    return EXT.test(name) ? [p] : [];
  });
}

describe("OCR results", () => {
  it("are the README's, word for word", () => {
    const readme = readFileSync(join(ROOT, "projects/ocr/README.md"), "utf8");
    const result = readme.split("## Result")[1]?.split("\n## ")[0] ?? "";
    const lines = result
      .split("\n")
      .map((l) => l.replace(/^- /, "").trim())
      .filter(Boolean);
    expect(lines).toContain("Accuracy 99.6%.");
    const entry = readFileSync(join(ROOT, "src/content/work/document-ocr.md"), "utf8");
    const page = readFileSync(join(ROOT, "src/case-studies/document-ocr/data.ts"), "utf8");
    for (const l of lines) {
      expect(entry, l).toContain(l);
      expect(page, l).toContain(l);
    }
  });
});

describe("banned claims", () => {
  const all = DIRS.flatMap(files);
  it("scans the content, the worker corpus and the worker fixtures", () => {
    expect(all.some((f) => f.includes("workers/portfo/test/golden.test.ts"))).toBe(true);
    expect(all.some((f) => f.endsWith("workers/portfo/data/site.json"))).toBe(true);
  });
  for (const [re, name] of BANNED)
    it(`nothing says ${name}`, () => {
      const hits = all.flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .flatMap((line, i) => (re.test(line) ? [`${relative(ROOT, f)}:${i + 1}`] : [])),
      );
      expect(hits).toEqual([]);
    });
});
