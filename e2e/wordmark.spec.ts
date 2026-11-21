import { expect, test } from "@playwright/test";

for (const width of [320, 390, 414, 768, 1024, 1440]) {
  for (const path of ["/", "/work/document-ocr/"]) {
    test(`wordmark is a usable target at ${width}px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const wordmark = page.locator(".nav .wordmark");
      await expect(wordmark).toBeVisible();
      const box = await wordmark.boundingBox();
      if (!box) throw new Error("Wordmark has no bounding box");
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const checkHitTargets = async () => {
        const hits = await wordmark.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return [rect.top + 2, rect.bottom - 2].map((y) =>
            element.contains(document.elementFromPoint(rect.left + rect.width / 2, y)),
          );
        });
        expect(hits).toEqual([true, true]);
      };
      await checkHitTargets();
      const menu = page.locator(".nav .menu summary");
      if (await menu.isVisible()) {
        await menu.click();
        await expect(page.locator(".nav .menu")).toHaveAttribute("open", "");
        await checkHitTargets();
      }
    });
  }
}
