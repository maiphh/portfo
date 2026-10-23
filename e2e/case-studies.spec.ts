/**
 * Every page on the shared case-study template (e2e/case-study.spec.ts goes deeper on the
 * first one, Document OCR): overflow, flow label clamp and min font at the audit widths, the
 * flow's details panel and mobile sheet, reduced motion, and the page's authored moment. Then
 * the public projects' links, credit and screenshots, the order of the case studies, and the
 * retired URLs.
 */
import { expect, test } from "@playwright/test";
import { overflowReport } from "./overflow";

interface CasePage {
  slug: string;
  title: RegExp;
  badge: boolean;
  /** A node to open, and the heading its details show. */
  node: string;
  heading: RegExp;
  groups: string[];
  dotted: number;
  dives: number;
  /** The approved promo cut renders on this page. */
  video?: boolean;
  /** The signature's root and what lights up in it when the moment plays. */
  sig: string;
  lit: string;
}

export const PAGES: CasePage[] = [
  {
    slug: "legal-rag",
    title: /Legal RAG/,
    badge: true,
    node: "hybrid",
    heading: /Hybrid legal chunker/,
    groups: ["Ingest", "Question"],
    dotted: 1,
    dives: 3,
    sig: "[data-statute]",
    lit: "[data-chunk]",
  },
  {
    slug: "data-validation",
    title: /DVP · payroll data validation/,
    badge: true,
    video: true,
    node: "translate",
    heading: /engine\.translate/,
    groups: ["Init / update-rules", "Process"],
    dotted: 2,
    dives: 3,
    sig: "[data-compiler]",
    lit: "tr.flag",
  },
  {
    slug: "openportfo",
    title: /OpenPortfo/,
    badge: false,
    node: "agent",
    heading: /Chat agent/,
    groups: ["Daily clock"],
    dotted: 1,
    dives: 3,
    sig: "[data-book]",
    lit: "[data-refresh]",
  },
  {
    slug: "ecom",
    title: /Ecom shop template/,
    badge: false,
    node: "orders",
    heading: /orders\/machine\.ts/,
    groups: ["src/shop engine"],
    dotted: 0,
    dives: 3,
    sig: "[data-engine]",
    lit: "[data-core]",
  },
  {
    slug: "poet",
    title: /Poet/,
    badge: false,
    node: "worker",
    heading: /Worker poet-donations/,
    groups: [],
    dotted: 0,
    dives: 2,
    sig: "[data-money]",
    lit: "[data-paid]",
  },
];

const WIDTHS = [320, 360, 390, 414, 768, 1024, 1100, 1180, 1280, 1440];

for (const p of PAGES) {
  const url = `/work/${p.slug}/`;

  for (const width of WIDTHS)
    test(`${p.slug}: no overflow, clamped label or tiny text at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      await page.locator("#how-it-works").scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
      });
      expect(await page.evaluate(overflowReport, "main")).toEqual([]);
    });

  test.describe(p.slug, () => {
    test("template: title, badge, rail, dives, no legacy layout", async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("h1#cs-h")).toBeVisible();
      await expect(page.locator(".cs2-crumbs")).toContainText(p.title);
      await expect(page.locator("article.cs2[data-case]")).toHaveCount(1);
      await expect(page.locator(".cs-sheet")).toHaveCount(0);
      await expect(page.locator(".cs2-open .org-badge")).toHaveCount(p.badge ? 1 : 0);
      await expect(page.locator("[data-dive]")).toHaveCount(p.dives);
      await expect(page.locator("main video")).toHaveCount(p.video ? 1 : 0);
    });

    test("flow: details panel on desktop, bottom sheet on phones", async ({ page, isMobile }) => {
      await page.goto(url);
      const node = page.locator(`[data-flow="cs"] [data-node="${p.node}"]`);
      await node.scrollIntoViewIfNeeded();
      if (isMobile) {
        await node.tap();
        const sheet = page.locator("dialog#cs-sheet");
        await expect(sheet).toBeVisible();
        await expect(sheet.locator("h3")).toHaveText(p.heading);
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
        await expect(page.locator("#cs-detail > .flow-d h3")).toHaveText(p.heading);
        const boxes = await page.locator('[data-flow="cs"] .flow-groupbox').allInnerTexts();
        expect(boxes.sort()).toEqual([...p.groups].sort());
        await expect(page.locator('[data-flow="cs"] path.dotted')).toHaveCount(p.dotted);
        await page.keyboard.press("Escape");
        await expect(page.locator("#cs-detail")).toHaveAttribute("data-state", "empty");
      }
    });

    test("reduced motion: the signature is static and complete", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(url);
      await page.waitForTimeout(400);
      await expect(page.locator(p.sig)).not.toHaveClass(/is-anim/);
      await expect(page.locator(`${p.sig} ${p.lit}`)).toBeVisible();
    });

    test("with motion, the authored moment plays to its final state", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(url);
      await expect(page.locator(p.sig)).toHaveClass(/is-anim/);
      await expect(page.locator(`${p.sig} ${p.lit}`)).toHaveClass(/lit/, { timeout: 6000 });
    });
  });
}

/** Order of the case studies (home order, without Craftland, which has no page). */
const ORDER = ["document-ocr", "legal-rag", "data-validation", "openportfo", "ecom", "poet"];

test("previous and next step through every case study, and only case studies", async ({ page }) => {
  for (const [i, slug] of ORDER.entries()) {
    await page.goto(`/work/${slug}/`);
    const nav = page.locator(".cs2-next");
    const prev = nav.locator("a:not(.next)");
    const next = nav.locator("a.next");
    if (i === 0) await expect(prev).toHaveCount(0);
    else await expect(prev).toHaveAttribute("href", `/work/${ORDER[i - 1]}`);
    if (i === ORDER.length - 1) await expect(next).toHaveCount(0);
    else await expect(next).toHaveAttribute("href", `/work/${ORDER[i + 1]}`);
  }
});

test("retired URLs forward: Craftland to its home card, Mirror Now to the Ecom page", async ({
  page,
}) => {
  await page.goto("/work/craftland/");
  await page.waitForURL(/\/#work-craftland$/);
  await expect(page.locator("#work-craftland")).toBeAttached();
  await page.goto("/work/mirror-now");
  await page.waitForURL(/\/work\/ecom#mirror-now$/);
  await expect(page.locator("section#mirror-now h2")).toHaveText(
    /Mirror Now: the first shop built on the template/,
  );
});

test("the home page links only to pages that exist", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('#work-craftland a[href^="/work/"]')).toHaveCount(0);
  const hrefs = await page
    .locator('a[href^="/work/"]')
    .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href") ?? ""))]);
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) {
    expect(h).not.toMatch(/craftland|mirror-now/);
    expect((await request.get(h)).status(), h).toBe(200);
  }
});

test.describe("public projects: links, credit and real screenshots", () => {
  test("OpenPortfo: repository link and the OpenStock credit", async ({ page }) => {
    await page.goto("/work/openportfo/");
    await expect(
      page.locator('.cs2-links a[href="https://github.com/maiphh/openportfo"]'),
    ).toBeVisible();
    const credit = page.locator("[data-credit]");
    await expect(credit).toContainText(/cloned from/);
    await expect(
      credit.locator('a[href="https://github.com/Open-Dev-Society/OpenStock"]'),
    ).toBeVisible();
    // A personal project (Phu, 2026-10-22), not presented as coursework.
    await expect(page.locator(".cs2-open .meta-line")).toContainText("Personal project");
    expect(await page.locator("main").innerText()).not.toMatch(/assessment|RMIT|coursework/i);
  });

  test("Ecom: illustrations only (private repos), Mirror Now as the first shop", async ({
    page,
  }) => {
    await page.goto("/work/ecom/");
    await expect(page.locator(".cs2-rail a[href='#mirror-now']")).toBeVisible();
    await expect(page.locator("main img")).toHaveCount(0);
    await expect(page.locator('main a[href*="github.com"]')).toHaveCount(0);
    await expect(page.locator("main")).toContainText(/the first shop built on the template/i);
  });

  test("POET: links, and only the vetted captures (no photos of children)", async ({ page }) => {
    await page.goto("/work/poet/");
    await expect(page.locator('.cs2-links a[href="https://maiphh.github.io/poet/"]')).toBeVisible();
    await expect(page.locator('.cs2-links a[href="https://github.com/maiphh/poet"]')).toBeVisible();
    const srcs = await page
      .locator("main img")
      .evaluateAll((im) => im.map((i) => i.getAttribute("src")).sort());
    expect(srcs).toEqual(
      ["form", "letter", "wall"].map((n) => `/work/poet/${n}.webp`),
    );
  });

  for (const slug of ["openportfo", "poet"])
    test(`${slug}: every screenshot loads, has alt text and keeps its aspect ratio`, async ({
      page,
    }) => {
      await page.goto(`/work/${slug}/`);
      // Deep dives are an accordion on narrow screens.
      await page.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
      });
      const imgs = page.locator("main img");
      const n = await imgs.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const img = imgs.nth(i);
        await img.scrollIntoViewIfNeeded();
        await expect(img).toHaveAttribute("alt", /\S{3,}/);
        await expect
          .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
          .toBe(true);
        const r = await img.evaluate((el: HTMLImageElement) => ({
          shown: el.clientWidth / el.clientHeight,
          real: el.naturalWidth / el.naturalHeight,
        }));
        expect(Math.abs(r.shown - r.real)).toBeLessThan(0.02);
      }
    });
});

test.describe("DVP promo cut (approved 2026-10-22)", () => {
  const URL = "/work/data-validation/";

  test("muted, no preload, poster, no scene description; plays in view", async ({ page }) => {
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
      poster: "/work/data-validation/motion-poster.jpg",
      autoplay: false,
      described: null,
    });
    await expect(page.locator("#vid-desc")).toHaveCount(0);
    await expect(page.locator(".cs2-video figcaption")).toContainText(/not results/);
    const res = await page.request.get("/work/data-validation/motion.mp4");
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeGreaterThan(300_000);
    await v.scrollIntoViewIfNeeded();
    await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  });

  test("reduced motion: stays on its poster", async ({ page }) => {
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
});
