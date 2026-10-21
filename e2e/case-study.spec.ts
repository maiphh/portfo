import { expect, test } from "@playwright/test";
import { overflowReport } from "./overflow";

const URL = "/work/document-ocr/";
// The 8 audit widths, plus both sides of the 6-column flow's list switch (1076px container).
const WIDTHS = [320, 360, 390, 414, 768, 1024, 1100, 1180, 1280, 1440];

for (const width of WIDTHS) {
  test(`Document OCR case study has no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#how-it-works").scrollIntoViewIfNeeded();
    // Open every collapsed block so its content is measured too.
    await page.evaluate(() => {
      for (const d of document.querySelectorAll("details")) d.open = true;
    });
    expect(await page.evaluate(overflowReport, "main")).toEqual([]);
  });
}

test.describe("Document OCR case study", () => {
  test("safe defaults: badge, no result figures, no solo claim, no video", async ({ page }) => {
    await page.goto(URL);
    const head = page.locator(".cs2-open");
    await expect(head.locator(".org-badge")).toHaveText(/Enterprise\s*,?\s*Talentnet/);
    await expect(head.locator(".meta-line > span:not(.org-badge)")).not.toContainText([
      "Talentnet",
    ]);
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const banned of ["98%", "90%", "99.6", "8,000", "300 h", "solo"])
      expect(text, `"${banned}" on the page`).not.toContain(banned);
    await expect(page.locator("main video")).toHaveCount(0);
    // The outcome TODO and the open questions only show with ?dev.
    await expect(page.locator("[data-dev-only]").first()).toBeHidden();
    await page.goto(`${URL}?dev`);
    await expect(page.getByText("TODO (Phu):")).toBeVisible();
    await expect(page.getByText("Still to confirm (shown with ?dev)")).toBeVisible();
  });

  test("home cards carry the badge on the three Talentnet chapters", async ({ page }) => {
    await page.goto("/");
    for (const id of ["#work-ocr", "#work-rag", "#work-validation"])
      await expect(page.locator(`${id} .meta-line .org-badge`)).toHaveCount(1);
    await expect(page.locator(".org-badge")).toHaveCount(3);
  });

  test("the flow opens details, and the stack link opens the versions table", async ({
    page,
    isMobile,
  }) => {
    await page.goto(URL);
    const node = page.locator('[data-flow="cs"] [data-node="worker"]');
    await node.scrollIntoViewIfNeeded();
    if (isMobile) {
      await node.tap();
      const sheet = page.locator("dialog#cs-sheet");
      await expect(sheet).toBeVisible();
      await expect(sheet.locator("h3")).toHaveText(/Extraction worker/);
      // The opened row stays visible between the sticky rail and the sheet.
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
      await expect(page.locator("#cs-detail > .flow-d h3")).toHaveText(/Extraction worker/);
      // Group outline and dotted model edge are drawn.
      await expect(page.locator('[data-flow="cs"] .flow-groupbox')).toHaveText("FastAPI process");
      await expect(page.locator('[data-flow="cs"] path.dotted')).toHaveCount(1);
    }
    const stack = page.locator("details#stack");
    await expect(stack).not.toHaveAttribute("open", "");
    await page.getByRole("link", { name: "Full stack with versions" }).click();
    await expect(stack).toHaveAttribute("open", "");
    await expect(stack.getByRole("table").first()).toBeVisible();
  });

  test("deep dives: open on desktop, an accordion on phones", async ({ page, isMobile }) => {
    await page.goto(URL);
    const dives = page.locator("[data-dive]");
    await expect(dives).toHaveCount(3);
    if (isMobile) {
      await expect(dives.first()).not.toHaveAttribute("open", "");
      const summary = dives.first().locator("summary");
      expect((await summary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await summary.tap();
      await expect(dives.first()).toHaveAttribute("open", "");
    } else {
      for (const d of await dives.all()) await expect(d).toHaveAttribute("open", "");
    }
  });

  test("rail links are 44px targets and mark the section in view", async ({ page }) => {
    await page.goto(URL);
    const links = page.locator("[data-rail] a");
    await expect(links).toHaveCount(4);
    for (const a of await links.all())
      expect((await a.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.locator("#deep-dives").scrollIntoViewIfNeeded();
    await page
      .locator("#deep-dives h2")
      .evaluate((h) => window.scrollBy(0, h.getBoundingClientRect().top - 200));
    await expect(page.locator('[data-rail] a[href="#deep-dives"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("reduced motion: the proof sheet is static and complete", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(URL);
    await expect(page.locator("[data-proof]")).not.toHaveClass(/is-anim/);
    await expect(page.locator("[data-proof] dd").first()).toBeVisible();
  });

  test("with motion, the scan line fills the workbook as the opener scrolls", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL);
    await expect(page.locator("[data-proof]")).toHaveClass(/is-anim/);
    await page.mouse.wheel(0, 900);
    await expect(page.locator("[data-proof] [data-cell].lit")).toHaveCount(4);
  });
});
