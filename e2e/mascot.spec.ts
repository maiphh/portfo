import { expect, test, type Page } from "@playwright/test";

type Dbg = {
  running(): boolean;
  frames(): number;
  mode(): "docked" | "float";
  view(): { mood: string; tool: string | null };
  pos(): { x: number; y: number; size: number };
  moving(): boolean;
};
declare global {
  interface Window {
    __portfoMascot?: Dbg;
  }
}

const launcher = (page: Page) => page.locator("[data-chat-launcher]");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Phu's assistant" });

async function ready(page: Page, path = "/") {
  await page.goto(path);
  await page.waitForFunction(() => !!window.__portfoMascot, null, { timeout: 15_000 });
}
/** Content-cover tuck slides the docked launcher off-screen; clear it before measuring or dragging. */
async function untuck(page: Page) {
  await launcher(page).evaluate((el) => el.classList.remove("is-tucked"));
  // Focus keeps boot's settle from tucking again while we interact.
  await launcher(page).focus();
  await page.waitForTimeout(350);
}
const mode = (page: Page) => page.evaluate(() => window.__portfoMascot?.mode());

test("stays visible while scrolling down", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page);
  await untuck(page);
  await page.evaluate(() => scrollBy(0, 700));
  // Before the content-cover settle (180ms): scroll-down must not tuck.
  await page.waitForTimeout(60);
  await expect(launcher(page)).not.toHaveClass(/is-tucked/);
});

test("docks at the bottom right of the window by default", async ({ page, isMobile }) => {
  if (isMobile) {
    await ready(page);
    expect(await mode(page)).toBe("docked");
    await expect(launcher(page)).toHaveAttribute("data-mascot", "docked");
    return;
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page);
  await untuck(page);
  expect(await mode(page)).toBe("docked");
  await expect(launcher(page)).not.toHaveClass(/is-float/);
  // Flush into the corner (24px edge at ≥1280px), where chat.css docked it.
  const b = await launcher(page).boundingBox();
  if (!b) throw new Error("no box");
  expect(Math.abs(b.x + b.width - (1280 - 24))).toBeLessThanOrEqual(2);
  expect(Math.abs(b.y + b.height - (900 - 24))).toBeLessThanOrEqual(2);
});

test("dragging snaps the mascot to the nearest corner, and a drop doesn't open the chat", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "mouse-only drag");
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page);
  await untuck(page);
  const b0 = await launcher(page).boundingBox();
  if (!b0) throw new Error("no box");
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  // Drop toward the top-left quadrant → snaps to the top-left corner.
  await page.mouse.move(400, 300, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => mode(page)).toBe("float");
  await expect(launcher(page)).toHaveAttribute("data-mascot", "float");
  await expect(launcher(page)).toHaveClass(/is-float/);
  await expect.poll(() => page.evaluate(() => window.__portfoMascot?.moving())).toBe(false);
  const b1 = await launcher(page).boundingBox();
  if (!b1) throw new Error("no box");
  // Top-left dock: 24px edge at ≥1280px.
  expect(Math.abs(b1.x - 24)).toBeLessThanOrEqual(2);
  expect(Math.abs(b1.y - 24)).toBeLessThanOrEqual(2);
  await expect(dialog(page)).toBeHidden();
  // Fixed positioning: it keeps the corner while the page scrolls.
  await page.evaluate(() => scrollTo(0, 800));
  await page.waitForTimeout(400);
  const b2 = await launcher(page).boundingBox();
  if (!b2) throw new Error("no box");
  expect(Math.abs(b2.x - b1.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(b2.y - b1.y)).toBeLessThanOrEqual(1);
  await page.evaluate(() => scrollTo(0, 0));
  // A plain click still opens the chat.
  await launcher(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(launcher(page)).toHaveClass(/is-away/);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
});

test("a dragged mascot snaps to a corner inside the viewport", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse-only drag");
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page);
  await untuck(page);
  const b0 = await launcher(page).boundingBox();
  if (!b0) throw new Error("no box");
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, 0, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__portfoMascot?.moving())).toBe(false);
  const b = await launcher(page).boundingBox();
  if (!b) throw new Error("no box");
  expect(Math.abs(b.x - 24)).toBeLessThanOrEqual(2);
  expect(Math.abs(b.y - 24)).toBeLessThanOrEqual(2);
  expect(b.x + b.width).toBeLessThanOrEqual(1280 + 0.5);
  expect(b.y + b.height).toBeLessThanOrEqual(900 + 0.5);
});

test("the chosen corner survives a full-page navigation", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse-only drag");
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page);
  await page.evaluate(() => sessionStorage.clear());
  await untuck(page);
  const b0 = await launcher(page).boundingBox();
  if (!b0) throw new Error("no box");
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => mode(page)).toBe("float");
  await expect.poll(() => page.evaluate(() => window.__portfoMascot?.moving())).toBe(false);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("portfo-mascot:v1")))
    .toContain('"corner":"tl"');

  await ready(page, "/work/document-ocr");
  await expect.poll(() => mode(page)).toBe("float");
  await expect(launcher(page)).toHaveAttribute("data-mascot", "float");
  const b = await launcher(page).boundingBox();
  if (!b) throw new Error("no box");
  expect(Math.abs(b.x - 24)).toBeLessThanOrEqual(2);
  expect(Math.abs(b.y - 24)).toBeLessThanOrEqual(2);
});

test("clicking or pressing Enter on the mascot opens the chat", async ({ page, isMobile }) => {
  await ready(page);
  await expect(launcher(page)).toHaveAccessibleName("Ask Phu's assistant");
  if (isMobile) {
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect(launcher(page)).not.toHaveClass(/is-tucked/);
    await launcher(page).tap();
  } else {
    await untuck(page);
    await expect.poll(() => page.evaluate(() => window.__portfoMascot?.moving())).toBe(false);
    await launcher(page).hover();
    await launcher(page).click();
  }
  await expect(dialog(page)).toBeVisible();
  await expect(launcher(page)).toHaveClass(/is-away/);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
  await expect(launcher(page)).not.toHaveClass(/is-away/);
  // Enter on the focused mascot opens it again.
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
});

test("thinking and per-tool states follow the chat's status events", async ({ page }) => {
  await ready(page);
  // Synthetic events: the public API the mascot listens to.
  await page.evaluate(() => {
    const fire = (type: string, detail: unknown) =>
      document.dispatchEvent(new CustomEvent(type, { detail }));
    fire("portfo-chat:state", { phase: "thinking", status: null, open: false });
    fire("portfo-chat:status", { tool: "get_github_stats", label: "Checking GitHub activity…" });
  });
  await expect(launcher(page)).toHaveAttribute("data-mood", "think");
  await expect(launcher(page)).toHaveAttribute("data-tool", "get_github_stats");
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent("portfo-chat:state", {
        detail: { phase: "error", status: null, open: false },
      }),
    ),
  );
  await expect(launcher(page)).toHaveAttribute("data-mood", "error");
  await expect(launcher(page)).not.toHaveAttribute("data-tool", /.+/);

  // A real (mock) turn: think with the tool, talk while streaming, then a happy bounce.
  await page.reload();
  await page.waitForFunction(() => !!window.__portfoMascot);
  await page.evaluate(() => window.portfoChat?.open());
  await page
    .getByRole("textbox", { name: "Ask about Phu's work" })
    .fill("How accurate is the OCR?");
  await page.keyboard.press("Enter");
  await expect(launcher(page)).toHaveAttribute("data-tool", "get_project");
  await expect(launcher(page)).toHaveAttribute("data-mood", "think");
  await expect(launcher(page)).toHaveAttribute("data-mood", "talk", { timeout: 10_000 });
  await expect(launcher(page)).toHaveAttribute("data-mood", /happy|idle/, { timeout: 10_000 });
  // The chat header's avatar is the mascot too.
  await expect(dialog(page).locator(".chat-avatar.has-ink canvas")).toHaveCount(1);
});

test("reduced motion: a static, docked mascot with no loop", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  expect(await mode(page)).toBe("docked");
  await page.waitForTimeout(600);
  const f0 = await page.evaluate(() => window.__portfoMascot?.frames());
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__portfoMascot?.running())).toBe(false);
  expect(await page.evaluate(() => window.__portfoMascot?.frames())).toBe(f0);
  // A frame is still drawn (the static ink dot).
  const inked = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(".mascot-ink");
    const d = c?.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    if (d) for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) n++;
    return n;
  });
  expect(inked).toBeGreaterThan(100);
  await expect(launcher(page)).not.toHaveClass(/is-float/);
});

test("the animation loop pauses while the tab is hidden", async ({ page }) => {
  await ready(page);
  await untuck(page);
  await expect.poll(() => page.evaluate(() => window.__portfoMascot?.running())).toBe(true);
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (h ? "hidden" : "visible"),
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  expect(await page.evaluate(() => window.__portfoMascot?.running())).toBe(false);
  const f0 = await page.evaluate(() => window.__portfoMascot?.frames());
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__portfoMascot?.frames())).toBe(f0);
  await setHidden(false);
  await expect.poll(() => page.evaluate(() => window.__portfoMascot?.running())).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__portfoMascot?.frames()))
    .toBeGreaterThan(f0 ?? 0);
});

/* ---------- an open FlowDiagram panel counts as content ---------- */

const PANELS = [
  { page: "/", flow: "how", node: '[data-node="worker"]' },
  { page: "/work/document-ocr/", flow: "cs", node: "[data-flow=cs] [data-node]" },
  { page: "/work/legal-rag/", flow: "cs", node: "[data-flow=cs] [data-node]" },
  { page: "/work/data-validation/", flow: "cs", node: "[data-flow=cs] [data-node]" },
  { page: "/work/openportfo/", flow: "cs", node: "[data-flow=cs] [data-node]" },
  { page: "/work/ecom/", flow: "cs", node: "[data-flow=cs] [data-node]" },
  { page: "/work/poet/", flow: "cs", node: "[data-flow=cs] [data-node]" },
];

for (const width of [1280, 1440])
  for (const where of PANELS)
    for (const corner of [null, "br"] as const)
      test(`${corner ? "floated" : "docked"} mascot stays off the open details panel on ${where.page} at ${width}px`, async ({
        page,
        isMobile,
      }) => {
        test.skip(isMobile, "the details panel is the desktop layout");
        if (corner)
          await page.addInitScript(
            (c) => sessionStorage.setItem("portfo-mascot:v1", JSON.stringify({ corner: c })),
            corner,
          );
        await page.setViewportSize({ width, height: 900 });
        await ready(page, where.page);
        expect(await mode(page)).toBe(corner ? "float" : "docked");

        const panel = page.locator(`#${where.flow}-detail`);
        await page.locator(where.node).first().click();
        await expect(panel).toHaveAttribute("data-state", "open");
        // Bring the panel's empty top edge just under the bottom-right rest spot, above Close:
        // where the mascot sat in the open-panel-1280 shot.
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error(`no ${sel}`);
          const r = el.getBoundingClientRect();
          scrollBy({ top: r.top - (innerHeight - 24 - 12), behavior: "instant" });
        }, `#${where.flow}-detail`);
        await page.waitForTimeout(1300);

        for (let i = 0; i < 8; i++) {
          const hit = await page.evaluate((sel) => {
            const l = document.querySelector<HTMLElement>("[data-chat-launcher]");
            const pe = document.querySelector(sel);
            if (!l || !pe) throw new Error("missing launcher or panel");
            if (Number(getComputedStyle(l).opacity) < 0.05) return null;
            const boxes = [l, l.querySelector(".mascot-ink")].flatMap((el) =>
              el ? [el.getBoundingClientRect()] : [],
            );
            const p = pe.getBoundingClientRect();
            const b = boxes.find(
              (m) => m.left < p.right && m.right > p.left && m.top < p.bottom && m.bottom > p.top,
            );
            return b ? { mascot: b.toJSON(), panel: p.toJSON() } : null;
          }, `#${where.flow}-detail`);
          expect(hit).toBeNull();
          await page.waitForTimeout(125);
        }

        if (corner) {
          // Closing frees the chosen corner again; the stored choice never changed.
          await panel.getByRole("button", { name: "Close details" }).click();
          await page.evaluate(() => scrollBy({ top: 2000, behavior: "instant" }));
          await page.waitForTimeout(500);
          const b = await launcher(page).boundingBox();
          if (!b) throw new Error("no box");
          expect(Math.abs(b.x + b.width - (width - 24))).toBeLessThanOrEqual(2);
          expect(Math.abs(b.y + b.height - (900 - 24))).toBeLessThanOrEqual(2);
          expect(await page.evaluate(() => sessionStorage.getItem("portfo-mascot:v1"))).toContain(
            '"corner":"br"',
          );
        }
      });
