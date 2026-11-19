import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { overflowReport } from "./overflow";

const shots = process.env.SUPPORT_SHOTS_DIR ?? "/workspace/portfo-shots/buy-me-claude";
type Rail = "payos" | "polar";
type State = "pending" | "paid" | "expired" | "failed" | "creation_unknown";
type Fixture = {
  rail: Rail;
  state: State;
  geo: Rail;
  reviews: { name: string; text: string; supporter: boolean }[];
  requests: { path: string; body: Record<string, unknown> }[];
  outage: boolean;
  lost: boolean;
  slowGeo: boolean;
  oneClaude: boolean;
  expiresAt: string;
};
const status = (f: Fixture, id = "fixture-id") => ({
  id,
  rail: f.rail,
  status: f.state === "pending" && Date.parse(f.expiresAt) <= Date.now() ? "expired" : f.state,
  amountMinor: f.oneClaude ? 25000 : f.rail === "payos" ? 75000 : 900,
  currency: f.rail === "payos" ? "VND" : "USD",
  presetCount: f.oneClaude ? 1 : 3,
  expiresAt: f.expiresAt,
  paidAt: f.state === "paid" ? "2026-01-01T00:00:00Z" : null,
});
async function setup(page: Page, overrides: Partial<Fixture> = {}) {
  const f: Fixture = {
    rail: "payos",
    state: "pending",
    geo: "payos",
    reviews: [],
    requests: [],
    outage: false,
    lost: false,
    slowGeo: false,
    oneClaude: false,
    expiresAt: "2099-01-01T00:00:00Z",
    ...overrides,
  };
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile={render:(s,o)=>{setTimeout(()=>o.callback('fixture-token'),0);return s},reset:()=>{}};`,
    }),
  );
  await page.route("**/api/support/default-rail", async (route) => {
    if (f.slowGeo) await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ json: { defaultRail: f.geo } }).catch(() => {});
  });
  await page.route("https://support-fixture.invalid/api/support/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split("/").slice(3).join("/");
    const body = request.postDataJSON() ?? {};
    f.requests.push({ path, body });
    if (f.outage)
      return route.fulfill({
        status: 503,
        json: { error: "unavailable" },
        headers: { "access-control-allow-origin": "*" },
      });
    let data: unknown = {};
    if (path === "wall") data = { reviews: f.reviews, supporters: [] };
    else if (path === "pay") {
      f.rail = body.rail as Rail;
      if (f.lost) {
        f.lost = false;
        return route.abort();
      }
      data = {
        status: status(f, body.id as string),
        checkoutUrl:
          f.rail === "payos" ? "https://pay.payos.vn/fixture" : "https://sandbox.polar.sh/fixture",
        qrCode: f.rail === "payos" ? "fixture-qr" : null,
        transferNote: f.rail === "payos" ? "FIXTURE123" : null,
      };
    } else if (path.startsWith("checkout/"))
      data = {
        status: status(f),
        checkoutUrl:
          f.rail === "payos" ? "https://pay.payos.vn/fixture" : "https://sandbox.polar.sh/fixture",
        qrCode: f.rail === "payos" ? "fixture-qr" : null,
        transferNote: f.rail === "payos" ? "FIXTURE123" : null,
      };
    else if (path.startsWith("status/") || path.startsWith("confirm/"))
      data = status(f, path.split("/")[1]);
    else if (path.startsWith("review-token/"))
      data = { reviewToken: "fixture-review-token", expiresAt: "2099-01-01T00:00:00Z" };
    else if (path === "review") data = { id: body.submissionId, status: "pending" };
    return route.fulfill({ json: data, headers: { "access-control-allow-origin": "*" } });
  });
  return f;
}
async function open(page: Page) {
  await page.goto("/support/");
  await expect(page.locator("[data-pay]")).toBeEnabled();
}
async function start(page: Page) {
  await page.locator('[data-rail="payos"]').click();
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-qr]")).toBeVisible();
}
async function shot(page: Page, width: number, state: string) {
  expect(await page.evaluate(overflowReport, "#support")).toEqual([]);
  const small = await page
    .locator(
      "#support button:visible, #support a:visible, #support input:visible, #support textarea:visible, #support summary:visible",
    )
    .evaluateAll((els) =>
      els
        .map((el) => ({
          text: (el.textContent || el.tagName).trim().slice(0, 40),
          rect: el.getBoundingClientRect(),
        }))
        .filter((x) => x.rect.width < 44 || x.rect.height < 44)
        .map((x) => `${x.text} ${x.rect.width}x${x.rect.height}`),
    );
  expect(small).toEqual([]);
  const tinyText = await page
    .locator("#support *:visible")
    .evaluateAll((elements) =>
      elements
        .filter(
          (el) =>
            [...el.childNodes].some(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            ) && parseFloat(getComputedStyle(el).fontSize) < 12,
        )
        .map(
          (el) =>
            `${el.tagName}: ${getComputedStyle(el).fontSize} ${(el.textContent || "").trim().slice(0, 30)}`,
        ),
    );
  expect(tinyText).toEqual([]);
  await mkdir(shots, { recursive: true });
  await page.screenshot({
    path: `${shots}/${width}-${state}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test("VietQR is the default and card payments are unavailable", async ({ page }) => {
  const f = await setup(page, { geo: "polar" });
  await open(page);
  await expect(page.locator('[data-rail="payos"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("[data-card-coming-soon]")).toBeDisabled();
  await expect(page.locator("[data-card-coming-soon]")).toContainText("Card payments: coming soon");
  await page.locator('[data-amount="custom"]').click();
  await page.locator("#custom").fill("10500");
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-pay-error]")).toContainText("within the stated range");
  expect(f.requests.filter((r) => r.path === "pay")).toHaveLength(0);
});
test("QR copy and save; pending, expiry and late settlement", async ({ page, context }) => {
  const f = await setup(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await start(page);
  await page.locator("[data-copy]").click();
  await expect(page.locator("[data-status-extra]")).toHaveText("Bank note copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("FIXTURE123");
  const download = page.waitForEvent("download");
  await page.locator("[data-save]").click();
  expect((await download).suggestedFilename()).toBe("payment-qr.png");
  f.state = "expired";
  await page.locator("[data-recheck]").click();
  await expect(page.locator("[data-status-heading]")).toHaveText("That QR expired");
  await expect(page.locator("[data-copy]")).toBeHidden();
  await expect(page.locator("[data-save]")).toBeHidden();
  await expect(page.locator("[data-status-extra]")).toBeEmpty();
  f.state = "paid";
  await page.locator("[data-recheck]").click();
  await expect(page.locator("[data-status-heading]")).toHaveText("Payment received");
  await expect(page.locator("[data-badge]")).toBeVisible();
});
test("lost create response recovers after reload with same receipt", async ({ page }) => {
  const f = await setup(page, { lost: true });
  await open(page);
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-qr]")).toBeVisible();
  const attempt = await page.evaluate(() => sessionStorage.getItem("support-attempt"));
  await page.reload();
  await expect(page.locator("[data-qr]")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("support-attempt"))).toBe(attempt);
  expect(f.requests.filter((r) => r.path === "pay")).toHaveLength(1);
});
test("uncertain creation remains recheckable and offers a new attempt after reload", async ({
  page,
}) => {
  const f = await setup(page, { lost: true, state: "creation_unknown" });
  await open(page);
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-new]")).toBeVisible();
  await expect(page.locator("[data-status-description]")).toContainText("if you did not pay");
  await page.reload();
  await expect(page.locator("[data-new]")).toBeVisible();
  f.state = "paid";
  await page.locator("[data-recheck]").click();
  await expect(page.locator("[data-status-heading]")).toHaveText("Payment received");
  expect(f.requests.filter((r) => r.path === "pay")).toHaveLength(1);
});
test("late geo response preserves the verified receipt", async ({ page }) => {
  await setup(page, { slowGeo: true, state: "paid", oneClaude: true });
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "support-attempt",
      JSON.stringify({ id: "fixture-id", key: "fixture-key" }),
    ),
  );
  await page.goto("/support/");
  await expect(page.locator("[data-status-heading]")).toHaveText("Payment received");
  await page.waitForTimeout(1100);
  await expect(page.locator("[data-summary]")).toHaveText("1 × CLAUDE");
  await expect(page.locator("[data-total]").first()).toContainText("25.000");
});
test("countdown hides payment tools immediately on expiry", async ({ page }) => {
  await setup(page, { expiresAt: new Date(Date.now() + 2500).toISOString() });
  await open(page);
  await start(page);
  await expect(page.locator("[data-save]")).toBeHidden({ timeout: 5000 });
  await expect(page.locator("[data-copy]")).toBeHidden();
});
test("outage stays unconfirmed and free and badged notes await moderation", async ({ page }) => {
  const f = await setup(page);
  await open(page);
  await page.locator("#review-text").fill("A free note for the site");
  await page.locator("[data-review-submit]").click();
  await expect(page.locator("[data-review-status]")).toContainText("after a quick check");
  expect(f.requests.find((r) => r.path === "review")?.body.reviewToken).toBeUndefined();
  await expect(page.locator("[data-wall]")).not.toContainText("A free note");
  await start(page);
  f.state = "paid";
  await page.locator("[data-recheck]").click();
  await expect(page.locator("[data-badge]")).toBeVisible();
  // The fixture supplies a new challenge as a real widget would after reset.
  await page.reload();
  await expect(page.locator("[data-badge]")).toBeVisible();
  await page.locator("#review-text").fill("A supporter note for the site");
  await page.locator("[data-review-submit]").click();
  await expect(page.locator("[data-review-status]")).toContainText("after a quick check");
  expect(f.requests.filter((r) => r.path === "review").at(-1)?.body.reviewToken).toBe(
    "fixture-review-token",
  );
  f.reviews.push({ name: "Fixture", text: "A supporter note for the site", supporter: true });
  await page.reload();
  await expect(page.locator("[data-wall]")).toContainText("Fixture · supporter");
  f.outage = true;
  await page.reload();
  await expect(page.locator("[data-wall]")).toContainText("could not load");
  await expect(page.locator("[data-status-description]")).toContainText("unavailable");
});
for (const width of [320, 390, 414, 768, 1024, 1440]) {
  test(`responsive states and accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const f = await setup(page);
    await open(page);
    await expect(page.locator("[data-wall]")).toContainText("Nothing printed yet");
    await shot(page, width, "preview-empty-wall-review-footer-nav");
    for (const selector of [".r-s", ".b-blank p"]) {
      const ratio = await page.locator(selector).evaluate((el) => {
        const rgb = (value: string) =>
          (value.match(/\d+/g) || [])
            .slice(0, 3)
            .map(Number)
            .map((c) => {
              const v = c / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
        const luminance = (value: string) => {
          const [r = 0, g = 0, b = 0] = rgb(value);
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const foreground = luminance(getComputedStyle(el).color);
        const background = luminance(
          getComputedStyle(el.closest(".receipt, .b-blank") || el).backgroundColor,
        );
        return (
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        );
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
    await page.locator('[data-amount="1"]').focus();
    await page.keyboard.press("Space");
    await expect(page.locator('[data-amount="1"]')).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-amount="3"]')).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-amount="3"]')).toBeFocused();
    await page.locator('[data-amount="3"]').click();
    await start(page);
    await shot(page, width, "qr-confirming");
    f.state = "paid";
    await page.locator("[data-recheck]").click();
    await expect(page.locator("[data-status-heading]")).toHaveText("Payment received");
    await shot(page, width, "paid");
    f.state = "expired";
    await page.reload();
    await expect(page.locator("[data-status-heading]")).toHaveText("That QR expired");
    await shot(page, width, "expired");
    f.state = "failed";
    await page.locator("[data-recheck]").click();
    await expect(page.locator("[data-status-heading]")).toHaveText("Payment unconfirmed");
    await shot(page, width, "failed");
    expect(await page.locator(".receipt").evaluate((el) => getComputedStyle(el).transform)).toBe(
      "none",
    );
    await page.goto("/");
    const stub = page.locator(".b-fstub");
    await expect(stub).toBeVisible();
    const target = await stub.locator("a").boundingBox();
    expect(target?.width).toBeGreaterThanOrEqual(44);
    expect(target?.height).toBeGreaterThanOrEqual(44);
    await stub.screenshot({ path: `${shots}/${width}-footer-ticket.png`, animations: "disabled" });
  });
  test(`no JavaScript stays readable at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/support/");
    await expect(page.locator("h1")).toContainText("Buy me a Claude");
    await expect(page.locator("[data-pay]")).toBeDisabled();
    await expect(page.locator("[data-review-submit]")).toBeDisabled();
    expect(await page.locator("noscript").first().textContent()).toContain("JavaScript");
    expect(await page.evaluate(overflowReport, "#support")).toEqual([]);
    await shot(page, width, "no-js");
    await context.close();
  });
}
