import { expect, test } from "@playwright/test";

test("the portrait draws before the hero copy appears", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const title = page.locator(".hero-name");
  await expect(page.locator(".ascii-canvas")).toBeVisible();
  await expect(title).toBeHidden();
  await expect(page.locator(".hero-work")).toBeHidden();
  await expect(title).toBeVisible();
  await expect(page.locator(".hero-work")).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: innerHeight / 2, behavior: "instant" }));
  await expect
    .poll(() =>
      page
        .locator(".hero-stage")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42),
    )
    .toBeGreaterThan(0);
});

test("reduced motion opens with the complete portrait and actions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".ascii-fallback")).toBeVisible();
  await expect(page.locator(".hero-work")).toBeVisible();
});

test("case reading progress follows the article", async ({ page }) => {
  await page.goto("/work/document-ocr");
  await page.locator("#deep-dives").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .locator("[data-scanbar]")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a),
    )
    .toBeGreaterThan(0.1);
});
