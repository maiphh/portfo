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
  test("Phu's answers: README results, solo, no old figures", async ({ page }) => {
    await page.goto(URL);
    const head = page.locator(".cs-hero-a__meta");
    await expect(head.locator(".org-badge")).toHaveText(/Enterprise\s*,?\s*Talentnet/);
    await expect(head.locator(".cs-hero-a__mi")).not.toContainText("Talentnet");
    await expect(head).toContainText("Solo");
    // Verbatim from projects/ocr/README.md "## Result".
    await expect(page.locator("#overview")).toContainText(
      "Two months after go-live: 7 templates in use. 8,000 pages processed. Average processing time about 800 ms per page. Accuracy 99.6%. About 300 hours saved.",
    );
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

  test("home cards carry the badge on the three Talentnet chapters", async ({ page }) => {
    await page.goto("/");
    for (const id of ["#work-ocr", "#work-rag", "#work-validation"])
      await expect(page.locator(`${id} .meta-line .org-badge`)).toHaveCount(1);
    await expect(page.locator(".org-badge")).toHaveCount(3);
  });

  test("the architecture flow opens details; the how section has no stack", async ({
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
      // The opened row stays visible between the sticky rail and the sheet.
      const r = await node.boundingBox();
      const rail = await page.locator("[data-rail]").boundingBox();
      const s = await sheet.boundingBox();
      expect(r?.y ?? 0).toBeGreaterThanOrEqual((rail?.y ?? 0) + (rail?.height ?? 0) - 1);
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
    await expect(page.locator("#how-it-works .cs2-stack")).toHaveCount(0);
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
    // The figure sits outside the fold, so it shows on every width.
    await expect(page.locator(".plate svg:visible")).toHaveCount(3);
  });

  test("rail links are 44px targets and mark the section in view", async ({ page }) => {
    await page.goto(URL);
    const links = page.locator("[data-rail] a");
    await expect(links).toHaveCount(4);
    for (const a of await links.all())
      expect((await a.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.locator("#deep-dives").scrollIntoViewIfNeeded();
    await page
      .locator("#deep-dives h2")
      .evaluate((h) => window.scrollBy(0, h.getBoundingClientRect().top - 200));
    await expect(page.locator('[data-rail] a[href="#deep-dives"]')).toHaveAttribute(
      "aria-current",
      "true",
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

  test("the first screen ends on the rail at the fold", async ({ page }) => {
    for (const [w, h] of [
      [390, 844],
      [430, 932],
      [1024, 768],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(URL);
      const r = await page.locator("[data-rail]").boundingBox();
      expect(Math.round((r?.y ?? 0) + (r?.height ?? 0)), `${w}×${h}`).toBeLessThanOrEqual(h);
    }
  });
});
