import { expect, test, type Page } from "@playwright/test";

type Dbg = {
  running(): boolean;
  frames(): number;
  mode(): "roam" | "docked";
  view(): { mood: string; tool: string | null };
  pos(): { x: number; y: number; size: number };
  moving(): boolean;
  roam(): void;
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
const mode = (page: Page) => page.evaluate(() => window.__portfoMascot?.mode());

/** The content column: `main .wrap` minus its padding. */
const column = (page: Page) =>
  page.evaluate(() => {
    const w = document.querySelector("main .wrap") as HTMLElement;
    const r = w.getBoundingClientRect();
    const cs = getComputedStyle(w);
    return {
      left: r.left + parseFloat(cs.paddingLeft),
      right: r.right - parseFloat(cs.paddingRight),
    };
  });

test("docks below 1280px and roams the margins from 1280px", async ({ page, isMobile }) => {
  if (isMobile) {
    await ready(page);
    expect(await mode(page)).toBe("docked");
    await expect(launcher(page)).toHaveAttribute("data-mascot", "docked");
    return;
  }
  await page.setViewportSize({ width: 1279, height: 900 });
  await ready(page);
  expect(await mode(page)).toBe("docked");
  await expect(launcher(page)).not.toHaveClass(/is-roaming/);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => mode(page)).toBe("roam");
  await expect(launcher(page)).toHaveClass(/is-roaming/);
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect.poll(() => mode(page)).toBe("docked");
});

test("roaming stays in the side margins and keeps a 44px target", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    await expect.poll(() => mode(page)).toBe("roam");
    const col = await column(page);
    for (let i = 0; i < 24; i++) {
      if (i % 6 === 0) await page.evaluate(() => window.__portfoMascot?.roam());
      await page.waitForTimeout(150);
      const b = await launcher(page).boundingBox();
      if (!b) throw new Error("no box");
      expect(b.width).toBeGreaterThanOrEqual(44);
      const offscreen = b.x + b.width <= 0 || b.x >= width;
      const left = b.x + b.width <= col.left + 0.5;
      const right = b.x >= col.right - 0.5;
      expect(offscreen || left || right, `x=${b.x} at ${width}`).toBe(true);
    }
  }
});

test("clicking or pressing Enter on the mascot opens the chat", async ({ page, isMobile }) => {
  await ready(page);
  await expect(launcher(page)).toHaveAccessibleName("Ask Phu's assistant");
  if (isMobile) {
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect(launcher(page)).not.toHaveClass(/is-tucked/);
    await launcher(page).tap();
  } else {
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
  await expect(launcher(page)).not.toHaveClass(/is-roaming/);
});

test("the animation loop pauses while the tab is hidden", async ({ page }) => {
  await ready(page);
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
