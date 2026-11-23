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
