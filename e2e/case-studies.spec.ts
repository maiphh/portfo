/**
 * Every page on the shared case-study template (e2e/case-study.spec.ts goes deeper on the
 * first one, Document OCR): overflow, flow label clamp and min font at the audit widths, the
 * flow's details panel and mobile sheet. Then Hero A on all six pages (name, mark, reduced
 * motion, no-JS, the intro), the public projects' links, credit and screenshots, the order of
 * the case studies, and the retired URLs.
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
      await expect(page.locator(".cs-hero-a__meta .org-badge")).toHaveCount(p.badge ? 1 : 0);
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
  });
}

/** Hero A (HERO-A-SPEC.md): the name is the h1, the headline's mark, the meta strip. */
const HEROES = [
  { slug: "document-ocr", name: "Document OCR", mark: "clean data out" },
  { slug: "legal-rag", name: "Legal RAG", mark: "the citation" },
  { slug: "data-validation", name: "DVP", mark: "turned into code" },
  { slug: "openportfo", name: "OpenPortfo", mark: "side by side" },
  { slug: "ecom", name: "Ecom", mark: "many storefronts" },
  { slug: "poet", name: "POET", mark: "youth charity" },
];

/** What the hero looks like at rest: the HTML end state. */
const heroState = () => {
  const q = (s: string) => document.querySelector<HTMLElement>(s);
  const css = (s: string) => {
    const el = q(s);
    return el ? getComputedStyle(el) : null;
  };
  return {
    stage: css(".cs-hero-a__stage")?.visibility,
    fill: css(".cs-hero-a__fill")?.transform,
    fillIn: css(".cs-hero-a__fill-in")?.transform,
    outline: css(".cs-hero-a__ol")?.visibility,
    sweep:
      css(".cs-hero-a__sweep")?.display === "none" || css(".cs-hero-a__sweep")?.opacity === "0",
    mark: css(".hx-mk")?.transform,
    line: css(".cs-hero-a__line")?.opacity,
    noSig: !q(".cs2-sig, [data-sig], .cs2-open"),
  };
};
const AT_REST = {
  stage: "visible",
  fill: "none",
  fillIn: "none",
  outline: "hidden",
  sweep: true,
  mark: "none",
  line: "1",
  noSig: true,
};

test.describe("Hero A", () => {
  for (const h of HEROES) {
    const url = `/work/${h.slug}/`;
    test(`${h.slug}: one h1 named "${h.name}", the mark, the rail count`, async ({ page }) => {
      await page.goto(url);
      const h1 = page.locator("h1");
      await expect(h1).toHaveCount(1);
      await expect(
        page.getByRole("heading", { level: 1, name: h.name, exact: true }),
      ).toBeVisible();
      await expect(page.locator(".cs-hero-a__ol")).toHaveAttribute("aria-hidden", "true");
      await expect(page.locator(".cs-hero-a__line mark.hx-mark")).toHaveText(h.mark);
      const n = await page.locator("[data-dive]").count();
      await expect(page.locator('[data-rail] a[href="#deep-dives"]')).toHaveText(
        `Highlights${String(n).padStart(2, "0")} (${n})`,
      );
      await expect(page.locator(".cs-hero-a__meta")).toHaveCSS("font-size", "12px");
    });

    test(`${h.slug}: reduced motion shows the end state`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(url);
      await page.waitForTimeout(400);
      expect(await page.evaluate(heroState)).toEqual(AT_REST);
      await expect(page.locator(".cs-hero-a__ol .char, .cs-hero-a__ol div")).toHaveCount(0);
    });

    test(`${h.slug}: the hero at rest fits from 320px to 1440px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(overflowReport, "[data-hero-a]"), `${width}px`).toEqual([]);
      }
    });
  }

  test("no JS: the name, headline and mark are complete; no sweep, no hairline", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    for (const h of HEROES) {
      await page.goto(`/work/${h.slug}/`);
      expect(await page.evaluate(heroState), h.slug).toEqual(AT_REST);
      await expect(page.locator(".cs-hero-a__sweep")).toBeHidden();
      await expect(page.locator(".cs2-rail__ln")).toBeHidden();
      // The page-transition curtain is SSR-covered on case pages; without JS it must not show.
      await expect(page.locator("#t-curtain")).toBeHidden();
      await expect(page.locator("#t-readout")).toBeHidden();
    }
    await ctx.close();
  });

  // The visible part of each rail link (the rail scrolls sideways) against the chat launcher.
  const railUnderLauncher = () => {
    const l = document.querySelector(".chat-launcher");
    if (!l || getComputedStyle(l).display === "none") return [];
    const L = l.getBoundingClientRect();
    const R = document.querySelector("[data-rail]")?.getBoundingClientRect();
    if (!R) return ["no rail"];
    const hits: string[] = [];
    for (const a of document.querySelectorAll("[data-rail] a")) {
      const r = a.getBoundingClientRect();
      const w = Math.min(r.right, R.right, L.right) - Math.max(r.left, R.left, L.left);
      const h = Math.min(r.bottom, L.bottom) - Math.max(r.top, L.top);
      if (w > 0 && h > 0) hits.push((a.textContent ?? "").trim());
    }
    return hits;
  };
  const LAUNCHER_SIZES = [
    [360, 780],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1440, 900],
  ] as const;

  for (const js of [true, false])
    test(`the chat button never covers a rail link (${js ? "JS" : "no JS"})`, async ({
      browser,
      isMobile,
    }) => {
      test.skip(isMobile, "sizes are set per context; runs once");
      test.setTimeout(120_000);
      for (const [width, height] of LAUNCHER_SIZES) {
        const ctx = await browser.newContext({
          viewport: { width, height },
          javaScriptEnabled: js,
          reducedMotion: "reduce",
        });
        const page = await ctx.newPage();
        for (const slug of ["legal-rag", "document-ocr", "openportfo"]) {
          await page.goto(`/work/${slug}/`);
          if (!js) {
            // It can't open the chat without JS, so it isn't shown at all.
            await expect(page.locator(".chat-launcher")).toBeHidden();
            expect(await page.evaluate(railUnderLauncher), `${slug} ${width}`).toEqual([]);
            continue;
          }
          // After the launcher settles (boot.ts re-places it at 400ms and 2.6s), then with the
          // rail stuck under the nav.
          await page.waitForTimeout(2800);
          expect(await page.evaluate(railUnderLauncher), `${slug} ${width} top`).toEqual([]);
          await page.mouse.wheel(0, height);
          await page.waitForTimeout(1200);
          expect(await page.evaluate(railUnderLauncher), `${slug} ${width} stuck`).toEqual([]);
        }
        await ctx.close();
      }
    });

  test("the rail count is the small accent pill; the rest of the rail reads at 12px+", async ({
    page,
  }) => {
    await page.goto("/work/legal-rag/");
    const pill = page.locator(".cs2-rail__n");
    await expect(pill).toHaveAttribute("aria-hidden", "true");
    const css = await pill.evaluate((el) => {
      const c = getComputedStyle(el);
      const acc = c.getPropertyValue("--acc").trim();
      const probe = document.createElement("i");
      probe.style.color = acc;
      document.body.append(probe);
      const accRgb = getComputedStyle(probe).color;
      probe.remove();
      return {
        accent: c.color === accRgb,
        border: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor === c.color}`,
        radius: c.borderTopLeftRadius,
        size: c.fontSize,
        padding: c.padding,
      };
    });
    expect(css).toEqual({
      accent: true,
      border: "1px solid true",
      radius: "3px",
      size: "11px",
      padding: "3px 4px",
    });
    // The 11px count is decorative (aria-hidden, with an sr-only " (n)"); every other piece of
    // rail text keeps the 12px floor (the overflow audit skips the sideways-scrolling rail).
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("[data-rail] *")]
        .filter(
          (el) =>
            el.firstChild?.nodeType === Node.TEXT_NODE &&
            (el.textContent ?? "").trim() &&
            !el.closest('[aria-hidden="true"], .sr-only') &&
            parseFloat(getComputedStyle(el).fontSize) < 12,
        )
        .map((el) => el.outerHTML.slice(0, 60)),
    );
    expect(small).toEqual([]);
  });

  test("with motion, the intro plays once and lands as the rail hairline", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/work/legal-rag/");
    // Mid-intro the outline is split into letters and shown.
    await expect(page.locator(".cs-hero-a__ol")).toHaveCSS("visibility", "visible");
    await expect.poll(() => page.locator(".cs-hero-a__ol div").count()).toBeGreaterThan(0);
    // Then: the filled name at rest, the hairline drawn under the rail.
    await expect
      .poll(() => page.evaluate(heroState), { timeout: 8000 })
      .toMatchObject({ fill: "none", fillIn: "none", outline: "hidden", sweep: true, line: "1" });
    await expect(page.locator(".cs2-rail__ln")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  });
});

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
    await expect(page.locator(".cs-hero-a__meta")).toContainText("Personal project");
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
    expect(srcs).toEqual(["form", "letter"].map((n) => `/work/poet/${n}.webp`));
  });

  for (const slug of ["openportfo", "poet"])
    test(`${slug}: every screenshot loads, has alt text and keeps its aspect ratio`, async ({
      page,
    }) => {
      await page.goto(`/work/${slug}/`);
      // The deep-dive text folds on phones; open it so nothing is hidden.
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

  test("muted, no preload, lazy poster, no scene description; plays in view", async ({ page }) => {
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
    // The poster="" is set only as the frame nears the viewport.
    await expect(v).toHaveAttribute("data-poster-src", "/work/data-validation/motion-poster.jpg");
    await expect(page.locator(".cs2-video figcaption")).toContainText(/not results/);
    await expect(page.locator(".cs2-video-head")).toContainText(/demo values/i);
    const res = await page.request.get("/work/data-validation/motion.mp4");
    expect(res.status()).toBe(200);
    expect((await res.body()).length).toBeGreaterThan(300_000);
    await v.scrollIntoViewIfNeeded();
    await expect(v).toHaveAttribute("poster", "/work/data-validation/motion-poster.jpg");
    await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  });

  test("reduced motion: stays on its poster; the play button plays it", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(URL);
    const v = page.locator("main video[data-case-video]");
    await v.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    expect(await v.evaluate((el: HTMLVideoElement) => [el.paused, el.readyState])).toEqual([
      true,
      0,
    ]);
    const play = page.locator("[data-video-play]");
    await expect(play).toBeVisible();
    expect((await play.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await play.click();
    await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
    await expect(v).toBeFocused();
    await expect(play).toBeHidden();
  });

  test("data saver: no autoplay, the play button instead", async ({ page }) => {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "connection", { value: { saveData: true } }),
    );
    await page.goto(URL);
    const v = page.locator("main video[data-case-video]");
    await v.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    expect(await v.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    await expect(page.locator("[data-video-play]")).toBeVisible();
  });

  test("the cut sits right after the overview and counts as Overview in the rail", async ({
    page,
  }) => {
    await page.goto(URL);
    expect(await page.evaluate(() => document.querySelector("#overview + section")?.id ?? "")).toBe(
      "video",
    );
    await page
      .locator("#video h2")
      .evaluate((h) => window.scrollBy(0, h.getBoundingClientRect().top - 140));
    await expect(page.locator('[data-rail] a[href="#overview"]')).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
