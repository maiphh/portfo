import { expect, test } from "@playwright/test";
import { overflowReport } from "./overflow";

const WIDTHS = [320, 360, 390, 414, 768, 1024, 1280, 1440];

for (const width of WIDTHS) {
  test(`"How this site works" has no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.locator("#how").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    // The grid with edges, or the list below 728px of container (flow spec).
    const flow = page.locator('[data-flow="how"]');
    await expect(flow).toHaveClass(width >= 800 ? /\bis-js\b(?!.*is-list)/ : /is-list/);
    expect(await page.evaluate(overflowReport, "#how")).toEqual([]);
  });
}

// The real architecture (workers/portfo): every outside service hangs off the Worker.
const EDGES = [
  "browser→pages",
  "browser→worker",
  "worker→d1",
  "worker→quota",
  "worker→ai",
  "worker→resend",
  "resend→email",
  "cron→worker",
  "worker→github",
];

test.describe("flow on desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator("#how").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
  });

  test("edges join the right pairs of nodes", async ({ page }) => {
    const report = await page.evaluate(() => {
      const flow = document.querySelector<HTMLElement>('[data-flow="how"]');
      if (!flow) return { pairs: [], bad: ["no flow"] };
      const o = flow.getBoundingClientRect();
      const box = (id: string) => {
        const r = flow.querySelector(`[data-node="${id}"]`)?.getBoundingClientRect();
        return (
          r && { l: r.left - o.left, t: r.top - o.top, r: r.right - o.left, b: r.bottom - o.top }
        );
      };
      const on = ([x, y]: [number, number], b: { l: number; t: number; r: number; b: number }) => {
        const tol = 1.5;
        const inX = x >= b.l - tol && x <= b.r + tol;
        const inY = y >= b.t - tol && y <= b.b + tol;
        return (
          ((Math.abs(x - b.l) <= tol || Math.abs(x - b.r) <= tol) && inY) ||
          ((Math.abs(y - b.t) <= tol || Math.abs(y - b.b) <= tol) && inX)
        );
      };
      const pairs: string[] = [];
      const bad: string[] = [];
      for (const p of flow.querySelectorAll<SVGPathElement>("svg path")) {
        const { a = "", b = "" } = p.dataset;
        pairs.push(`${a}→${b}`);
        const len = p.getTotalLength();
        const s = p.getPointAtLength(0);
        const e = p.getPointAtLength(len);
        const A = box(a);
        const B = box(b);
        if (!A || !B) bad.push(`${a}→${b}: missing node`);
        else {
          if (!on([s.x, s.y], A)) bad.push(`${a}→${b} starts at ${s.x},${s.y}, off ${a}`);
          if (!on([e.x, e.y], B)) bad.push(`${a}→${b} ends at ${e.x},${e.y}, off ${b}`);
        }
      }
      return { pairs, bad };
    });
    expect(report.pairs.sort()).toEqual([...EDGES].sort());
    expect(report.bad).toEqual([]);
  });

  test("edges follow the nodes when the width changes", async ({ page }) => {
    for (const width of [1280, 1024, 900]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(() => {
            const flow = document.querySelector('[data-flow="how"]');
            const p = flow?.querySelector<SVGPathElement>('path[data-a="resend"]');
            const n = flow?.querySelector('[data-node="email"]')?.getBoundingClientRect();
            if (!flow || !p || !n) return Infinity;
            const o = flow.getBoundingClientRect();
            const end = p.getPointAtLength(p.getTotalLength());
            return Math.abs(end.x - (n.left - o.left));
          }),
        )
        .toBeLessThan(1.5);
    }
  });

  test("a node opens its details below the flow and closes back to the node", async ({ page }) => {
    const worker = page.locator('[data-node="worker"]');
    const region = page.locator("#how-detail");
    const open = region.locator("> .flow-d");
    await worker.click();
    await expect(worker).toHaveAttribute("aria-expanded", "true");
    await expect(worker).toHaveAttribute("aria-controls", "how-detail");
    await expect(region).toHaveAttribute("data-state", "open");
    await expect(open.getByRole("heading", { level: 3 })).toHaveText(/portfo Worker/);
    await expect(open.getByText("What it does")).toBeVisible();
    await expect(open.getByText("Key decision")).toBeVisible();
    // Connected edges light up; the rest dim.
    expect(await page.locator('[data-flow="how"] path.on').count()).toBe(7);
    expect(await page.locator('[data-flow="how"] path.dim').count()).toBe(2);

    await page.locator('[data-node="ai"]').click();
    await expect(worker).toHaveAttribute("aria-expanded", "false");
    await expect(open.getByRole("heading", { level: 3 })).toHaveText(/Workers AI/);

    await region.getByRole("button", { name: "Close details" }).click();
    await expect(region).toHaveAttribute("data-state", "empty");
    await expect(page.locator('[data-node="ai"]')).toBeFocused();
    await expect(page.locator('[data-flow="how"] path.on')).toHaveCount(0);
  });

  test("keyboard: arrows, Home and End move; Enter opens; Esc closes", async ({ page }) => {
    const nodes = page.locator("[data-flow=how] [data-node]");
    await nodes.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(nodes.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(nodes.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(nodes.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(nodes.last()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(nodes.first()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(nodes.first()).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(nodes.nth(1)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#how-detail > .flow-d h3")).toHaveText(/Static pages/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#how-detail")).toHaveAttribute("data-state", "empty");
    await expect(nodes.nth(1)).toBeFocused();
  });

  test("an open node reopens in the sheet when the layout becomes a list", async ({ page }) => {
    await page.locator('[data-node="d1"]').click();
    await page.setViewportSize({ width: 600, height: 900 });
    const sheet = page.locator("dialog#how-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("h3")).toHaveText(/Cloudflare D1/);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(sheet).toBeHidden();
    await expect(page.locator("#how-detail > .flow-d h3")).toHaveText(/Cloudflare D1/);
  });

  test("reduced motion: no packets", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.locator("#how").scrollIntoViewIfNeeded();
    await expect(page.locator("[data-flow=how] path")).toHaveCount(EDGES.length);
    await expect(page.locator("[data-flow=how] .pk")).toHaveCount(0);
  });

  test("without JS every node's details are on the page", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("#how-detail .flow-d")).toHaveCount(10);
    await expect(
      page.locator("#how-detail").getByText("Key decision", { exact: true }).first(),
    ).toBeVisible();
    await ctx.close();
  });
});

test.describe("flow on mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "list layout");

  test("a row opens a bottom sheet; Esc, Close and the scrim close it", async ({ page }) => {
    await page.goto("/");
    await page.locator("#how").scrollIntoViewIfNeeded();
    await expect(page.locator('[data-flow="how"]')).toHaveClass(/is-list/);
    const row = page.locator('[data-node="worker"]');
    const sheet = page.locator("dialog#how-sheet");
    const box = await row.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await row.tap();
    await expect(sheet).toBeVisible();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(row).toHaveAttribute("aria-controls", "how-sheet");
    await expect(sheet.locator("h3")).toHaveText(/portfo Worker/);
    await expect(sheet.getByRole("button", { name: "Close details" })).toBeFocused();
    // The opened row stays visible above the sheet.
    const r = await row.boundingBox();
    const s = await sheet.boundingBox();
    expect((r?.y ?? 0) + (r?.height ?? 0)).toBeLessThanOrEqual(s?.y ?? 0);
    const nav = await page.locator("header.nav").boundingBox();
    expect(r?.y ?? -1).toBeGreaterThanOrEqual((nav?.y ?? 0) + (nav?.height ?? 0));

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(row).toBeFocused();
    await expect(row).toHaveAttribute("aria-expanded", "false");

    const d1 = page.locator('[data-node="d1"]');
    await d1.tap();
    await expect(sheet.locator("h3")).toHaveText(/Cloudflare D1/);
    await sheet.getByRole("button", { name: "Close details" }).tap();
    await expect(sheet).toBeHidden();
    await expect(d1).toBeFocused();

    await d1.tap();
    await expect(sheet).toBeVisible();
    await page.mouse.click(195, 10);
    await expect(sheet).toBeHidden();
  });
});
