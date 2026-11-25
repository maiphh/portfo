/**
 * Section reveals must wait for scroll — a timer failsafe must not force-show
 * off-screen [data-reveal-child] nodes while ScrollTrigger is working.
 */
import { expect, test } from "@playwright/test";

test.describe("section scroll reveals", () => {
  test.skip(({ isMobile }) => isMobile, "desktop viewport keeps #how below the fold");

  test("off-screen How it works stays unrevealed past 5s, then reveals on scroll", async ({
    page,
  }) => {
    test.setTimeout(45_000);

    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    // #how must start below the fold so ScrollTrigger has not entered yet.
    const howTop = await page.locator("#how").evaluate((el) => el.getBoundingClientRect().top);
    expect(howTop).toBeGreaterThan(900);

    await page.waitForTimeout(5500);

    const afterWait = await page.locator("#how [data-reveal-child]").evaluateAll((els) =>
      els.map((el) => ({
        done: el.hasAttribute("data-reveal-done"),
        opacity: Number(getComputedStyle(el).opacity),
      })),
    );
    expect(afterWait.length).toBeGreaterThan(0);
    for (const child of afterWait) {
      expect(child.done).toBe(false);
      expect(child.opacity).toBeLessThan(0.05);
    }

    await page.locator("#how").scrollIntoViewIfNeeded();

    await expect
      .poll(async () => page.locator("#how [data-reveal-child]:not([data-reveal-done])").count(), {
        timeout: 5000,
      })
      .toBe(0);

    await expect
      .poll(
        async () =>
          page
            .locator("#how [data-reveal-child]")
            .evaluateAll((els) => els.every((el) => Number(getComputedStyle(el).opacity) > 0.95)),
        { timeout: 3000 },
      )
      .toBe(true);
  });
});

for (const [path, selector] of [
  ["/", ".sw-demo"],
  ["/work/document-ocr", ".hl-dv-fig"],
] as const) {
  test(`scroll scales the artwork forward and back on ${path}`, async ({ page }) => {
    await page.goto(path);
    const art = page.locator(selector).first();
    const scale = () => art.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    await expect.poll(scale).toBeLessThan(0.98);
    await art.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect.poll(scale).toBeGreaterThan(0.99);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(scale).toBeLessThan(0.98);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(scale).toBe(1);
  });
}
