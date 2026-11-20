import { expect, test } from "@playwright/test";

test("experience sits before work and the IELTS mark never overlaps its label", async ({
  page,
}) => {
  await page.goto("/");
  const order = await page.evaluate(() => {
    const tl = document.querySelector("#timeline")!;
    const work = document.querySelector("#work")!;
    return tl.compareDocumentPosition(work) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  expect(order).toBeTruthy();

  await page.locator("#timeline").scrollIntoViewIfNeeded();
  const mark = page.locator(".mark-qual");
  await expect(mark).toContainText("IELTS 7.0");
  const gap = await mark.evaluate((el) => {
    const logo = el.querySelector<HTMLElement>(".org-logo")!.getBoundingClientRect();
    const label = el.querySelector<HTMLElement>("span:not(.org-logo)")!.getBoundingClientRect();
    return label.left - logo.right;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
});

test("the old notes row is gone; entry details open in a hover card", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the hover card is a pointer-only affordance");
  await page.goto("/");
  await expect(page.locator(".tl-notes")).toHaveCount(0);
  const bar = page.locator('.tl-grid .bar[data-note-id="talentnet"]');
  await bar.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await bar.hover();
  const modal = page.locator("[data-tl-modal]");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("At Talentnet");
  await expect(modal).toContainText("document OCR pipeline");
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});

test("phones get a vertical timeline and a tappable note card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#timeline").scrollIntoViewIfNeeded();
  await expect(page.locator(".tl-v")).toBeVisible();
  await expect(page.locator(".tl-grid")).toBeHidden();
  await page.locator('.tl-v-item[data-note-id="talentnet"]').click();
  const modal = page.locator("[data-tl-modal]");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("At Talentnet");
});
