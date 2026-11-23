import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const slug of ["document-ocr", "openportfo", "legal-rag", "poet"]) {
  await page.goto(`http://localhost:4321/work/${slug}/`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2600);
  const tech = page.locator(".cs2-tech");
  await tech.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `.tmp-${slug}-tech.png` });
  const overview = page.locator("#overview");
  await overview.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `.tmp-${slug}-overview.png` });
}
await page.setViewportSize({ width: 390, height: 844 });
{
  await page.goto("http://localhost:4321/work/document-ocr/");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2600);
  await page.locator(".cs2-tech").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".tmp-mobile-tech.png" });
  await page.locator("#overview").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".tmp-mobile-overview.png" });
  await page.locator("#limits").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: ".tmp-mobile-limits.png" });
}
await browser.close();
