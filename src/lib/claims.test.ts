/**
 * Banned-claims guard. Until Phu confirms them, the old OCR result figures and the "built it all
 * on my own" line stay out of everything the site, the chat worker and their test fixtures say:
 * content, data, mocks, case-study data, the worker's corpus and its recorded/scripted fixtures.
 * (e2e/case-study.spec.ts checks the rendered pages.)
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
  [/99[.,]6\s?%/, "99.6%"],
  [/\b300\s?(h|hours)\b/i, "300 h"],
  [/\b8,000\b|\b8\.000\b/, "8,000"],
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
