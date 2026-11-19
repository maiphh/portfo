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
  supporters: { name: string; presetCount: number | null; month: string }[];
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
    supporters: [],
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
      body: `window.turnstile={widgets:{},render:(s,o)=>{window.turnstile.widgets[s]=o;const e=document.createElement('iframe');e.title='Verification';e.style.cssText='width:'+(o.size==='compact'?'150px':o.size==='flexible'?'max(300px, 100%)':'300px')+';height:'+(o.size==='compact'?'140px':'65px')+';border:0';document.querySelector(s).append(e);setTimeout(()=>o.callback('fixture-token-1'),0);return s},reset:(s)=>setTimeout(()=>window.turnstile.widgets[s].callback('fixture-token-2'),0)};`,
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
    if (path === "wall") data = { reviews: f.reviews, supporters: f.supporters };
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
  const f = await setup(page, { expiresAt: new Date(Date.now() + 2500).toISOString() });
  await open(page);
  await start(page);
  await expect(page.locator("[data-save]")).toBeHidden({ timeout: 5000 });
  await expect(page.locator("[data-copy]")).toBeHidden();
  await page.route("**/api/support/status/**", (route) =>
    route.fulfill({
      json: { ...status(f), status: "pending" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.locator("[data-recheck]").click();
  await expect(page.locator("[data-status-heading]")).toHaveText("That QR expired");
  await expect(page.locator("[data-qr]")).toBeHidden();
  await expect(page.locator("[data-receipt-detail]")).toBeEmpty();
  await page.unroute("**/api/support/status/**");
  f.state = "paid";
  await page.locator("[data-recheck]").click();
  await expect(page.locator("[data-status-heading]")).toHaveText("Payment received");
  await expect(page.locator("[data-receipt-detail]")).toBeEmpty();
  await page.locator("[data-new]").click();
  await expect(page.locator("[data-receipt-detail]")).toBeEmpty();
});
test("invalid payment fields stay editable and review success clears the draft", async ({
  page,
}) => {
  const f = await setup(page);
  await open(page);
  await page.locator(".b-more summary").click();
  await page.locator("#support-name").fill("<invalid>");
  await page.locator("[data-pay]").click();
  await expect(page.locator("#support-name")).toBeFocused();
  await expect(page.locator("[data-pay-error]")).toContainText("name");
  expect(f.requests.filter((r) => r.path === "pay")).toHaveLength(0);
  await page.locator("#support-name").fill("Valid name");
  await start(page);
  await page.locator("#review-text").fill("A note");
  await page.locator("[data-review-submit]").click();
  await expect(page.locator("[data-review-status]")).toContainText("after a quick check");
  await expect(page.locator("#review-text")).toBeEmpty();
  await page.locator("[data-review-submit]").click();
  expect(f.requests.filter((r) => r.path === "review")).toHaveLength(1);
});
test("stalled checkout times out and rechecks the same receipt", async ({ page }) => {
  const f = await setup(page);
  await page.route("**/api/support/pay", async () => {
    await new Promise((resolve) => setTimeout(resolve, 12000));
  });
  await open(page);
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-recheck]")).toBeVisible({ timeout: 15000 });
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("support-attempt") || "null"),
  );
  expect(f.requests.some((r) => r.path === `status/${saved.id}`)).toBe(true);
});
test("server validation keeps the payment form editable", async ({ page }) => {
  await setup(page);
  await page.route("**/api/support/pay", (route) =>
    route.fulfill({
      status: 422,
      json: { error: "invalid_fields" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await open(page);
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-order]")).toBeVisible();
  await expect(page.locator("#support-name")).toBeFocused();
  await expect(page.locator("[data-pay-error]")).toContainText("name and message");
  expect(await page.evaluate(() => sessionStorage.getItem("support-attempt"))).toBeNull();
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
test("stale status cannot undo a paid receipt", async ({ page }) => {
  const f = await setup(page);
  await open(page);
  await start(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let seen!: () => void;
  const requested = new Promise<void>((resolve) => {
    seen = resolve;
  });
  await page.route("**/api/support/status/**", async (route) => {
    await page.unroute("**/api/support/status/**");
    seen();
    await gate;
    await route.fulfill({ json: status(f), headers: { "access-control-allow-origin": "*" } });
  });
  await page.locator("[data-recheck]").click();
  await requested;
  f.state = "paid";
  await page.locator("[data-recheck]").click();
  await expect(page.locator("[data-status-heading]")).toHaveText("Payment received");
  f.state = "pending";
  release();
  await page.waitForTimeout(300);
  await expect(page.locator("[data-status-heading]")).toHaveText("Payment received");
  await expect(page.locator("[data-qr]")).toBeHidden();
});
test("new attempt survives return-page reload and preserves prior receipt", async ({ page }) => {
  const f = await setup(page, { state: "expired" });
  await open(page);
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-new]")).toBeVisible();
  const old = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("support-attempt") || "null"),
  );
  await page.goto(`/support/return/?id=${old.id}`);
  await expect(page.locator("[data-new]")).toBeVisible();
  await page.locator("[data-new]").click();
  f.state = "pending";
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-qr]")).toBeVisible();
  const next = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("support-attempt") || "null"),
  );
  expect(next.id).not.toBe(old.id);
  await page.reload();
  await expect(page.locator("[data-qr]")).toBeVisible();
  f.state = "paid";
  await page.locator(`[data-receipt-links] a[href*="${old.id}"]`).click();
  await expect(page.locator("[data-status-heading]")).toHaveText("Payment received");
  expect(f.requests.some((r) => r.path === `status/${old.id}`)).toBe(true);
});
test("checkout retry refreshes the challenge and keeps the receipt", async ({ page }) => {
  const f = await setup(page);
  await page.route("**/api/support/pay", async (route) => {
    await page.unroute("**/api/support/pay");
    await route.fulfill({
      status: 503,
      json: { error: "unavailable" },
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.route("**/api/support/status/**", async (route) => {
    await page.unroute("**/api/support/status/**");
    await route.fulfill({
      status: 404,
      json: { error: "not_found" },
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await open(page);
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-retry-create]")).toBeEnabled();
  const previous = await page.evaluate(() => sessionStorage.getItem("support-attempt"));
  await page.locator("[data-retry-create]").click();
  await expect(page.locator("[data-qr]")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("support-attempt"))).toBe(previous);
  expect(f.requests.find((r) => r.path === "pay")?.body.turnstileToken).toBe("fixture-token-2");
});
test("validation during a retry preserves the uncertain receipt", async ({ page }) => {
  await setup(page, { lost: true });
  await page.route("**/api/support/status/**", (route) =>
    route.fulfill({
      status: 404,
      json: { error: "not_found" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await open(page);
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-retry-create]")).toBeEnabled();
  const saved = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("support-attempt") || "null"),
  );
  await page.route("**/api/support/pay", (route) =>
    route.fulfill({
      status: 422,
      json: { error: "invalid_fields" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.locator("[data-retry-create]").click();
  await expect(page.locator("[data-order]")).toBeVisible();
  await expect(page.locator(`[data-receipt-links] a[href*="${saved.id}"]`)).toBeVisible();
  expect(
    await page.evaluate((id) => sessionStorage.getItem(`support-attempt:${id}`), saved.id),
  ).toBeTruthy();
});

test("retry retains the original order when fields change during creation", async ({ page }) => {
  const f = await setup(page, { lost: true });
  await page.route("**/api/support/status/**", (route) =>
    route.fulfill({
      status: 404,
      json: { error: "not_found" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route("**/api/support/pay", async (route) => {
    await page.unroute("**/api/support/pay");
    await page.locator('[data-amount="5"]').click();
    await route.fallback();
  });
  await open(page);
  await page.locator("[data-pay]").click();
  await expect(page.locator("[data-retry-create]")).toBeEnabled();
  await page.locator("[data-retry-create]").click();
  await expect(page.locator("[data-qr]")).toBeVisible();
  const requests = f.requests.filter((r) => r.path === "pay");
  expect(requests).toHaveLength(2);
  expect(requests[1]?.body.selection).toEqual(requests[0]?.body.selection);
  expect(requests[1]?.body.id).toBe(requests[0]?.body.id);
});

test("pending QR allows a new amount and keeps the previous receipt", async ({ page }) => {
  await setup(page);
  await open(page);
  await start(page);
  const old = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("support-attempt") || "null"),
  );
  await page.locator("[data-new]").click();
  await expect(page.locator(`[data-receipt-links] a[href*="${old.id}"]`)).toBeVisible();
  await page.locator('[data-amount="5"]').click();
  await expect(page.locator("[data-pay]")).toBeEnabled();
});

test("expired receipts only recheck manually", async ({ page }) => {
  const f = await setup(page);
  await open(page);
  await start(page);
  f.state = "expired";
  await page.locator("[data-recheck]").click();
  await expect(page.locator("[data-status-heading]")).toHaveText("That QR expired");
  const reads = f.requests.filter((r) => r.path.startsWith("status/")).length;
  await page.waitForTimeout(6500);
  expect(f.requests.filter((r) => r.path.startsWith("status/")).length).toBe(reads);
  await page.locator("[data-recheck]").click();
  expect(f.requests.filter((r) => r.path.startsWith("status/")).length).toBe(reads + 1);
});

test("badge claim failure requires retry or an explicit choice", async ({ page }) => {
  const f = await setup(page);
  await page.route("**/api/support/review-token/**", async (route) => {
    await page.unroute("**/api/support/review-token/**");
    await route.fulfill({
      status: 503,
      json: { error: "unavailable" },
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await open(page);
  await start(page);
  f.state = "paid";
  await page.locator("[data-recheck]").click();
  await expect(page.locator("[data-retry-badge]")).toBeVisible();
  await expect(page.locator("[data-review-submit]")).toBeDisabled();
  await page.locator("[data-retry-badge]").click();
  await expect(page.locator("[data-badge]")).toBeVisible();
  await expect(page.locator("[data-review-submit]")).toBeEnabled();
});

test("polls for payment within three seconds", async ({ page }) => {
  const f = await setup(page);
  await open(page);
  await start(page);
  f.state = "paid";
  await expect(page.locator("[data-status-heading]")).toHaveText("Payment received", {
    timeout: 4500,
  });
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
    f.reviews.push({ name: "N".repeat(40), text: "W".repeat(160), supporter: true });
    f.supporters.push({ name: "N".repeat(40), presetCount: 3, month: "2026-01" });
    await page.reload();
    await expect(page.locator(".b-q")).toBeVisible();
    await shot(page, width, "populated-wall");
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
    await page.locator("[data-new]").click();
    await expect(page.locator("[data-receipt-links] a")).toBeVisible();
    await shot(page, width, "previous-receipt");
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
