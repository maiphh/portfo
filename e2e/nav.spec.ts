import { expect, test } from "@playwright/test";

test("the home nav follows the hero boundary and current section", async ({ page, isMobile }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary", includeHidden: true });
  await expect(nav).toBeHidden();
  await expect(page.locator("[data-hero]")).toBeInViewport({ ratio: 0.9 });

  await page.getByRole("link", { name: /scroll.*work and study/i }).click();
  await expect(nav).toBeVisible();
  if (isMobile) await nav.getByText("Menu", { exact: true }).click();
  const controls = isMobile
    ? nav.locator(".nav-mobile")
    : nav.locator(".nav-group:not(.nav-mobile)");
  const me = controls.getByText("Me", { exact: true });
  if (isMobile) await me.tap();
  else await me.hover();
  await expect(controls.getByRole("link", { name: /^Experience/ })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await controls.getByRole("link", { name: /^Work/ }).click();
  await expect(page).toHaveURL(/#work$/);
  await expect(me.locator("..")).not.toHaveAttribute("open");
  await expect(controls.locator('a[href="#work"]')).toHaveAttribute("aria-current", "location");

  await nav.getByRole("link", { name: "Get in Touch" }).click();
  await expect(page).toHaveURL(/#contact$/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(nav).toBeHidden();
});

test("Wall opens /wall from its preview panel; BMC stays coming soon", async ({
  page,
  isMobile,
}) => {
  await page.goto("/#work");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  if (isMobile) await nav.getByText("Menu", { exact: true }).tap();
  const controls = isMobile
    ? nav.locator(".nav-mobile")
    : nav.locator(".nav-group:not(.nav-mobile)");

  const wall = controls.getByText("Wall", { exact: true });
  if (isMobile) await wall.tap();
  else await wall.hover();
  const wallPanel = wall.locator("..").locator(".nav-panel");
  await expect(wallPanel.getByText("Memory Wall", { exact: true })).toBeVisible();
  await expect(wallPanel.getByRole("link", { name: "Open wall" })).toHaveAttribute(
    "href",
    "/wall",
  );
  await wallPanel.getByRole("link", { name: "Open wall" }).click();
  await expect(page).toHaveURL(/\/wall\/?$/);
  await expect(page.getByRole("region", { name: "Personal wall" })).toBeVisible();

  await page.goto("/#work");
  await expect(nav).toBeVisible();
  if (isMobile) await nav.getByText("Menu", { exact: true }).tap();
  const bmc = controls.getByText("BMC", { exact: true });
  if (isMobile) await bmc.tap();
  else await bmc.hover();
  const bmcPanel = bmc.locator("..").locator(".nav-panel");
  await expect(bmcPanel.getByText("Buy me Claude", { exact: true })).toBeVisible();
  await expect(bmcPanel.getByText("Coming soon")).toBeVisible();
  await expect(bmcPanel.getByRole("link")).toHaveCount(0);
  if (!isMobile) await bmcPanel.hover();
  await expect(bmcPanel).toBeVisible();
});

test("case studies show the nav on arrival and support keyboard disclosure", async ({
  page,
  isMobile,
}) => {
  await page.goto("/work/legal-rag");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  if (isMobile) await nav.getByText("Menu", { exact: true }).press("Enter");
  const controls = isMobile
    ? nav.locator(".nav-mobile")
    : nav.locator(".nav-group:not(.nav-mobile)");
  const me = controls.getByText("Me", { exact: true });
  await me.press("Enter");
  const work = controls.getByRole("link", { name: /^Work/ });
  await expect(work).toHaveAttribute("href", "/#work");
  await work.press("Escape");
  await expect(work).toBeHidden();
  await expect(me).toBeFocused();
});

test("the navbar fits on a narrow phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Uses the mobile layout");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/#timeline");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Get in Touch" })).toBeInViewport({ ratio: 1 });
  await nav.getByText("Menu", { exact: true }).tap();
  await expect(nav.locator(".nav-mobile").getByText("BMC", { exact: true })).toBeInViewport({
    ratio: 1,
  });
});
