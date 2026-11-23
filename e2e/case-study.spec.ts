import { expect, test } from "@playwright/test";
import { overflowReport } from "./overflow";
import { lumaSpread } from "./pixels";

const URL = "/work/document-ocr/";
// The 8 audit widths, plus both sides of the 6-column flow's list switch (1076px container).
const WIDTHS = [320, 360, 390, 414, 768, 1024, 1100, 1180, 1280, 1440];

for (const width of WIDTHS) {
  test(`Document OCR case study has no overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#how-it-works").scrollIntoViewIfNeeded();
    // Open every collapsed block so its content is measured too.
    await page.evaluate(() => {
      for (const d of document.querySelectorAll("details")) d.open = true;
    });
    expect(await page.evaluate(overflowReport, "main")).toEqual([]);
  });
}

test.describe("Document OCR case study", () => {
  test("Phu's answers: README results, Talentnet logo, no old figures", async ({ page }) => {
    await page.goto(URL);
    const head = page.locator(".cs-hero-a__meta");
    await expect(head.locator(".org-logo img")).toHaveAttribute("alt", "Talentnet");
    await expect(head.locator(".org-badge")).toHaveCount(0);
    await expect(head.locator(".cs-hero-a__mi")).toHaveCount(0);
    // Result figures from projects/ocr/README.md "## Result", shown as three metric cards.
    const metrics = page.locator("#overview .cs2-metrics li");
    await expect(metrics).toHaveCount(3);
    await expect(metrics.nth(0)).toContainText("7");
    await expect(metrics.nth(0)).toContainText("Templates in use");
    await expect(metrics.nth(1)).toContainText("8,000");
    await expect(metrics.nth(1)).toContainText("Pages processed");
    await expect(metrics.nth(2)).toContainText("99.6%");
    await expect(metrics.nth(2)).toContainText("Accuracy");
    await expect(page.locator("#overview .cs2-metrics-note")).toContainText(
      "Two months after go-live",
    );
    await expect(page.locator("#overview .cs2-metrics-note")).toContainText("800 ms");
    await expect(page.locator("#overview .cs2-metrics-note")).toContainText("300 hours saved");
    const text = await page.locator("main").innerText();
    for (const old of ["98%", ">90%", "90% of"])
      expect(text, `"${old}" on the page`).not.toContain(old);
    // Nothing left to confirm: no TODO slot even with ?dev.
    await page.goto(`${URL}?dev`);
    await expect(page.getByText("TODO (Phu):")).toHaveCount(0);
  });

  test("the promo cut: muted, no preload, lazy poster; plays in view", async ({ page }) => {
    await page.goto(URL);
    const v = page.locator("main video[data-case-video]");
    await expect(v).toHaveCount(1);
    expect(
      await v.evaluate((el: HTMLVideoElement) => ({
        muted: el.muted,
        inline: el.playsInline,
        preload: el.preload,
        poster: el.getAttribute("poster"),
        autoplay: el.autoplay,
        described: el.getAttribute("aria-describedby"),
      })),
    ).toMatchObject({
      muted: true,
      inline: true,
      preload: "none",
      poster: null,
      autoplay: false,
      described: null,
    });
    await expect(page.locator("#vid-desc")).toHaveCount(0);
    // The poster="" is set only as the frame nears the viewport (in the markup it would be
    // fetched with the page even with preload="none").
    await expect(v).toHaveAttribute("data-poster-src", "/work/document-ocr/motion-poster.jpg");
    const res = await page.request.get("/work/document-ocr/motion.mp4");
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeGreaterThan(500_000);
    await v.scrollIntoViewIfNeeded();
    await expect(v).toHaveAttribute("poster", "/work/document-ocr/motion-poster.jpg");
    await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  });

  test("reduced motion: the promo cut stays on its poster", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(URL);
    const v = page.locator("main video[data-case-video]");
    await v.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    expect(await v.evaluate((el: HTMLVideoElement) => [el.paused, el.readyState])).toEqual([
      true,
      0,
    ]);
  });

  test("home selected work carries the Talentnet logo on the featured OCR card", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#work-ocr .org-logo img")).toHaveAttribute("alt", "Talentnet");
    await expect(page.locator("#work[data-selected-work] .org-badge")).toHaveCount(0);
  });

  test("the architecture flow opens details; the how section carries the tech stack", async ({
    page,
    isMobile,
  }) => {
    await page.goto(URL);
    const node = page.locator('[data-flow="cs"] [data-node="worker"]');
    await node.scrollIntoViewIfNeeded();
    if (isMobile) {
      await node.tap();
      const sheet = page.locator("dialog#cs-sheet");
      await expect(sheet).toBeVisible();
      await expect(sheet.locator("h3")).toHaveText(/Extraction worker/);
      // The opened row stays visible between the sticky site nav and the sheet.
      const r = await node.boundingBox();
      const nav = await page.locator("header.nav").boundingBox();
      const s = await sheet.boundingBox();
      expect(r?.y ?? 0).toBeGreaterThanOrEqual((nav?.y ?? 0) + (nav?.height ?? 0) - 1);
      expect((r?.y ?? 0) + (r?.height ?? 0)).toBeLessThanOrEqual((s?.y ?? 0) + 1);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(node).toBeFocused();
    } else {
      await node.click();
      await expect(page.locator("#cs-detail > .flow-d h3")).toHaveText(/Extraction worker/);
      // Group outline and dotted model edge are drawn.
      await expect(page.locator('[data-flow="cs"] .flow-groupbox')).toHaveText("FastAPI process");
      await expect(page.locator('[data-flow="cs"] path.dotted')).toHaveCount(1);
    }
    await expect(page.locator("#how-it-works .cs2-tech")).toHaveCount(1);
    // Logo-only skill-icons row: OCR shows Next.js, FastAPI, PostgreSQL, Azure (Entra).
    await expect(page.locator("#how-it-works .cs2-tech-list > .cs2-tech-tile")).toHaveCount(4);
    await expect(page.locator("#how-it-works .cs2-how-sub > h3")).toHaveText([
      "Application flow",
      "Architecture",
    ]);
    await expect(page.getByRole("link", { name: "Full stack with versions" })).toHaveCount(0);
  });

  test("both diagrams tour until a stage is opened", async ({ page, isMobile }) => {
    await page.goto(URL);
    for (const id of ["app", "cs"]) {
      const flow = page.locator(`[data-flow="${id}"]`);
      await flow.scrollIntoViewIfNeeded();
      await expect(flow).toHaveAttribute("data-autoplay", "");
      await expect(flow).toHaveAttribute("data-auto", "running", { timeout: 4000 });
      await expect(flow.locator(".flow-node.is-auto")).toHaveCount(1, { timeout: 5000 });
    }
    const node = page.locator('[data-flow="app"] [data-node="input"]');
    await node.scrollIntoViewIfNeeded();
    if (isMobile) await node.tap();
    else await node.click();
    await expect(page.locator('[data-flow="app"]')).toHaveAttribute("data-auto", "paused");
    await expect(page.locator('[data-flow="app"] .is-auto')).toHaveCount(0);
    const detail = isMobile ? page.locator("dialog#app-sheet") : page.locator("#app-detail");
    await expect(detail.locator("h3").first()).toHaveText(/Input/);
  });

  test("deep dives: open on desktop, an accordion on phones", async ({ page, isMobile }) => {
    await page.goto(URL);
    const dives = page.locator("[data-dive]");
    await expect(dives).toHaveCount(3);
    if (isMobile) {
      await expect(dives.first()).not.toHaveAttribute("open", "");
      const summary = dives.first().locator("summary");
      expect((await summary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await summary.tap();
      await expect(dives.first()).toHaveAttribute("open", "");
    } else {
      for (const d of await dives.all()) await expect(d).toHaveAttribute("open", "");
    }
    // The drawing and its caption sit outside the fold, so they show on every width.
    await expect(page.locator("figure.hl-dv-fig svg:visible")).toHaveCount(3);
    await expect(page.locator(".hl-cap:visible")).toHaveCount(3);
  });

  test("the case study has no on-this-page rail", async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator("[data-rail], .cs2-rail, nav[aria-label='On this page']")).toHaveCount(
      0,
    );
  });

  for (const [w, h] of [
    [1440, 900],
    [430, 932],
    [768, 1024],
  ] as const)
    test(`the poster is not fetched on first load at ${w}×${h}, only once scrolled near`, async ({
      page,
    }) => {
      const seen: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("motion-poster")) seen.push(r.url());
      });
      await page.setViewportSize({ width: w, height: h });
      await page.goto(URL);
      await page.waitForLoadState("load");
      await page.waitForTimeout(800);
      expect(seen).toEqual([]);
      await expect(page.locator("video[data-case-video]")).not.toHaveAttribute("poster", /./);
      // Scroll until the frame is just under 200px below the fold: the poster loads, once.
      await page.evaluate(() => {
        const f = document.querySelector(".cs2-video-frame");
        if (f) scrollBy(0, f.getBoundingClientRect().top - innerHeight - 150);
      });
      await expect.poll(() => seen.length).toBe(1);
      await page.locator(".cs2-video-frame").scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      expect(seen).toHaveLength(1);
    });

  // Native controls paint an opaque grey layer over anything under the video, so the poster has
  // to be the video's own: the frame must show the poster's pixels, not a flat fill.
  for (const mode of ["normal", "reduce", "nojs"] as const)
    test(`the poster is visible in the frame (${mode})`, async ({ browser, isMobile }) => {
      test.skip(isMobile, "sizes are set per context; runs once");
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        javaScriptEnabled: mode !== "nojs",
        reducedMotion: mode === "reduce" ? "reduce" : "no-preference",
      });
      const page = await ctx.newPage();
      // Hold the video file back so "normal" shows the poster stage before any frame decodes.
      await page.route("**/motion.mp4", () => {});
      await page.goto(URL);
      const v = page.locator(mode === "nojs" ? "video.cs2-video-nojs" : "video[data-case-video]");
      await expect(v).toHaveCount(1);
      await expect(v).toBeVisible();
      await v.scrollIntoViewIfNeeded();
      await expect(v).toHaveAttribute("poster", "/work/document-ocr/motion-poster.jpg");
      await expect.poll(() => lumaSpread(browser, v), { timeout: 8000 }).toBeGreaterThan(12);
      await ctx.close();
    });

  test("the hero fits on the first screen", async ({ page }) => {
    for (const [w, h] of [
      [390, 844],
      [430, 932],
      [1024, 768],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(URL);
      const hero = await page.locator("[data-hero-a]").boundingBox();
      expect(Math.round((hero?.y ?? 0) + (hero?.height ?? 0)), `${w}×${h}`).toBeLessThanOrEqual(h);
    }
  });
});
