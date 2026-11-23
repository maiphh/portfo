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

test("Wall and BMC have previews with no live destination before launch", async ({
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

  for (const [label, title] of [
    ["Wall", "Memory Wall"],
    ["BMC", "Buy me Claude"],
  ] as const) {
    const toggle = controls.getByText(label, { exact: true });
    if (isMobile) await toggle.tap();
    else await toggle.hover();
    const panel = toggle.locator("..").locator(".nav-panel");
    await expect(panel.getByText(title, { exact: true })).toBeVisible();
    await expect(panel.getByText("Coming soon")).toBeVisible();
    await expect(panel.getByRole("link")).toHaveCount(0);
    if (!isMobile) await panel.hover();
    await expect(panel).toBeVisible();
  }
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
