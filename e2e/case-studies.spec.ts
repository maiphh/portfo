/**
 * Every page on the shared case-study template (e2e/case-study.spec.ts goes deeper on the
 * first one, Document OCR): overflow, flow label clamp and min font at the audit widths, the
 * flow's details panel and mobile sheet, reduced motion, and the page's authored moment.
 */
import { expect, test } from "@playwright/test";
import { overflowReport } from "./overflow";

interface CasePage {
  slug: string;
  title: RegExp;
  badge: boolean;
  /** A node to open, and the heading its details show. */
  node: string;
  heading: RegExp;
  groups: string[];
  dotted: number;
  dives: number;
  /** The signature's root and what lights up in it when the moment plays. */
  sig: string;
  lit: string;
}

export const PAGES: CasePage[] = [
  {
    slug: "legal-rag",
    title: /Legal RAG/,
    badge: true,
    node: "hybrid",
    heading: /Hybrid legal chunker/,
    groups: ["Ingest", "Question"],
    dotted: 1,
    dives: 3,
    sig: "[data-statute]",
    lit: "[data-chunk]",
  },
  {
    slug: "data-validation",
    title: /DVP · payroll data validation/,
    badge: true,
    node: "translate",
    heading: /engine\.translate/,
    groups: ["Init / update-rules", "Process"],
    dotted: 2,
    dives: 3,
    sig: "[data-compiler]",
    lit: "tr.flag",
  },
];

const WIDTHS = [320, 360, 390, 414, 768, 1024, 1100, 1180, 1280, 1440];

for (const p of PAGES) {
  const url = `/work/${p.slug}/`;

  for (const width of WIDTHS)
    test(`${p.slug}: no overflow, clamped label or tiny text at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      await page.locator("#how-it-works").scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
      });
      expect(await page.evaluate(overflowReport, "main")).toEqual([]);
    });

  test.describe(p.slug, () => {
    test("template: title, badge, rail, dives, no legacy layout", async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("h1#cs-h")).toBeVisible();
      await expect(page.locator(".cs2-crumbs")).toContainText(p.title);
      await expect(page.locator("article.cs2[data-case]")).toHaveCount(1);
      await expect(page.locator(".cs-sheet")).toHaveCount(0);
      await expect(page.locator(".cs2-open .org-badge")).toHaveCount(p.badge ? 1 : 0);
      await expect(page.locator("[data-dive]")).toHaveCount(p.dives);
      await expect(page.locator("main video")).toHaveCount(0);
    });

    test("flow: details panel on desktop, bottom sheet on phones", async ({ page, isMobile }) => {
      await page.goto(url);
      const node = page.locator(`[data-flow="cs"] [data-node="${p.node}"]`);
      await node.scrollIntoViewIfNeeded();
      if (isMobile) {
        await node.tap();
        const sheet = page.locator("dialog#cs-sheet");
        await expect(sheet).toBeVisible();
        await expect(sheet.locator("h3")).toHaveText(p.heading);
        const r = await node.boundingBox();
        const rail = await page.locator("[data-rail]").boundingBox();
        const s = await sheet.boundingBox();
        expect(r?.y ?? 0).toBeGreaterThanOrEqual((rail?.y ?? 0) + (rail?.height ?? 0) - 1);
        expect((r?.y ?? 0) + (r?.height ?? 0)).toBeLessThanOrEqual((s?.y ?? 0) + 1);
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(node).toBeFocused();
      } else {
        await node.click();
        await expect(page.locator("#cs-detail > .flow-d h3")).toHaveText(p.heading);
        const boxes = await page.locator('[data-flow="cs"] .flow-groupbox').allInnerTexts();
        expect(boxes.sort()).toEqual([...p.groups].sort());
        await expect(page.locator('[data-flow="cs"] path.dotted')).toHaveCount(p.dotted);
        await page.keyboard.press("Escape");
        await expect(page.locator("#cs-detail")).toHaveAttribute("data-state", "empty");
      }
    });

    test("reduced motion: the signature is static and complete", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(url);
      await page.waitForTimeout(400);
      await expect(page.locator(p.sig)).not.toHaveClass(/is-anim/);
      await expect(page.locator(`${p.sig} ${p.lit}`)).toBeVisible();
    });

    test("with motion, the authored moment plays to its final state", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(url);
      await expect(page.locator(p.sig)).toHaveClass(/is-anim/);
      await expect(page.locator(`${p.sig} ${p.lit}`)).toHaveClass(/lit/, { timeout: 6000 });
    });
  });
}
