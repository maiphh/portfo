/**
 * Highlights, flow version (HIGHLIGHTS-SPEC v2 §6.1), on every case study: no sideways scroll,
 * readable text and reachable targets; one numbered marker per step, clear of each other and
 * inside the drawing; the phone drawing in normal flow at ≤45% of the screen height; the step loop
 * running only while on screen and the tab is shown; reduced motion equal to no-JS; nothing
 * interactive in the drawing; and no third-party scripts or styles.
 */
import { expect, test, type Page } from "@playwright/test";

const SLUGS = ["document-ocr", "legal-rag", "data-validation", "openportfo", "ecom", "poet"];

/** Shown text and target sizes inside the highlights section. Runs in the page. */
function audit() {
  const out: string[] = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw)
    out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  const sec = document.querySelector("#deep-dives");
  if (!sec) return ["no #deep-dives"];
  const shown = (el: Element) =>
    el.getClientRects().length > 0 &&
    !el.closest("[hidden], .sr-only") &&
    getComputedStyle(el).visibility !== "hidden" &&
    Number(getComputedStyle(el).opacity) > 0;
  for (const el of sec.querySelectorAll(
    ".hl-mk, .mk-s, .st p, .cs2-chips li, .cs2-dive summary, .cs2-dive p",
  )) {
    if (!shown(el) || !el.textContent?.trim()) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) out.push(`${el.className} "${el.textContent.trim().slice(0, 24)}" ${fs}px`);
  }
  if (vw < 900)
    for (const el of sec.querySelectorAll<HTMLElement>(".cs2-dive summary")) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 44) out.push(`target "${el.textContent?.trim().slice(0, 24)}" h ${r.height}`);
    }
  // Nothing in a highlight takes focus, except "The detail" where it can fold (phones, no JS).
  const js = document.documentElement.classList.contains("js");
  for (const el of sec.querySelectorAll<HTMLElement>(
    "article.hl-dv a, article.hl-dv button, article.hl-dv input, article.hl-dv summary, article.hl-dv [tabindex]",
  )) {
    if (!el.offsetParent || el.tabIndex < 0) continue;
    if (el.tagName === "SUMMARY" && (vw < 900 || !js)) continue;
    out.push(`focusable ${el.tagName.toLowerCase()} in ${el.closest("article")?.id}`);
  }
  // No controls, labels or words in the drawing.
  for (const sel of [".cs2-ctrl", "[data-step]", "[data-play]", ".sheet", "button.lb", "svg text"])
    if (sec.querySelector(`article.hl-dv ${sel}`)) out.push(`${sel} present`);
  return out;
}

/** Each highlight's visible drawing: markers vs steps, overlaps (>2px) and the frame (2px in). */
function markers() {
  const out: string[] = [];
  for (const dv of document.querySelectorAll<HTMLElement>("article.hl-dv")) {
    const id = dv.id;
    const n = Number(dv.dataset.n);
    const figs = [...dv.querySelectorAll<HTMLElement>(".fig")].filter((f) => f.offsetParent);
    const fig = figs[0];
    if (figs.length !== 1 || !fig) {
      out.push(`${id}: ${figs.length} drawings shown`);
      continue;
    }
    const F = fig.getBoundingClientRect();
    const mks = [...fig.querySelectorAll<HTMLElement>(".hl-mk")].map((m) => ({
      n: m.dataset.n,
      r: m.getBoundingClientRect(),
    }));
    const steps = dv.querySelectorAll("ol.cs2-steps > li.st").length;
    if (mks.length !== n || steps !== n)
      out.push(`${id}: ${mks.length} markers, ${steps} steps, ${n}`);
    mks.forEach((a, i) => {
      if (
        a.r.left < F.left + 2 ||
        a.r.right > F.right - 2 ||
        a.r.top < F.top + 2 ||
        a.r.bottom > F.bottom - 2
      )
        out.push(
          `${id}: marker ${a.n} at ${a.r.left | 0},${a.r.top | 0}–${a.r.right | 0},${a.r.bottom | 0} outside ${F.left | 0},${F.top | 0}–${F.right | 0},${F.bottom | 0}`,
        );
      for (const b of mks.slice(i + 1)) {
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 2 && h > 2) out.push(`${id}: markers ${a.n} and ${b.n} overlap ${w | 0}x${h | 0}`);
      }
    });
  }
  return out;
}

const open = (page: Page) =>
  page.evaluate(() => {
    for (const d of document.querySelectorAll("details")) d.open = true;
  });

for (const slug of SLUGS)
  for (const width of [320, 360, 390, 430, 768, 1024, 1180, 1440])
    test(`${slug} highlights: sizes and no sideways scroll at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/work/${slug}/`);
      await page.evaluate(() => document.fonts.ready);
      await open(page);
      await page.locator("#deep-dives").scrollIntoViewIfNeeded();
      expect(await page.evaluate(audit)).toEqual([]);
    });

for (const slug of SLUGS)
  for (const width of [320, 390, 430, 1024, 1440])
    test(`${slug} highlights: markers clear of each other and the frame at ${width}px`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/work/${slug}/`);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(markers)).toEqual([]);
    });

for (const slug of SLUGS)
  test(`${slug} highlights: the phone drawing is in flow, ≤45% of the screen, above its list`, async ({
    page,
  }) => {
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/work/${slug}/`);
      const out = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("article.hl-dv")].flatMap((dv) => {
          const fig = dv.querySelector<HTMLElement>(".fig.ph");
          const ol = dv.querySelector("ol.cs2-steps");
          if (!fig?.offsetParent || !ol) return [`${dv.id}: no phone drawing or list`];
          const r = fig.getBoundingClientRect();
          const bad: string[] = [];
          if (r.height > 0.45 * innerHeight + 1) bad.push(`${dv.id}: ${r.height | 0}px tall`);
          for (const el of [fig, fig.parentElement]) {
            const p = el ? getComputedStyle(el).position : "";
            if (p !== "static" && p !== "relative") bad.push(`${dv.id}: position ${p}`);
          }
          if (r.bottom > ol.getBoundingClientRect().top + 0.5)
            bad.push(`${dv.id}: not above its list`);
          return bad;
        }),
      );
      expect(out, `${width}px`).toEqual([]);
    }
  });

for (const slug of SLUGS)
  test(`${slug} highlights: the step loop runs on screen and pauses offscreen and when hidden`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`/work/${slug}/`);
    const dv = page.locator("article.hl-dv").first();
    const n = Number(await dv.getAttribute("data-n"));
    // collect every step that gets the ring, from before the drawing comes on screen
    await dv.evaluate((el) => {
      const w = window as unknown as { __seen: Set<string>; __odd: string[] };
      w.__seen = new Set();
      w.__odd = [];
      new MutationObserver(() => {
        const li = [...el.querySelectorAll<HTMLElement>("li.st.is-now")].map((x) => x.dataset.s);
        const mk = [...el.querySelectorAll<HTMLElement>(".fig .hl-mk.is-now")].map(
          (x) => x.dataset.n,
        );
        for (const k of li) w.__seen.add(k ?? "");
        // the ringed marker and the ringed list item are the same step
        if (li.join() !== mk.join()) w.__odd.push(`list ${li.join()} vs marker ${mk.join()}`);
      }).observe(el, { subtree: true, attributes: true, attributeFilter: ["class"] });
    });
    await dv.locator(".hl-fig").evaluate((f) => f.scrollIntoView({ block: "center" }));
    await expect(dv).toHaveAttribute("data-flow", "running");
    const loop = Number(await dv.getAttribute("data-loop"));
    expect(loop).toBeGreaterThanOrEqual(6);
    expect(loop).toBeLessThanOrEqual(10);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __seen: Set<string> }).__seen.size), {
        timeout: loop * 1000 + 3000,
      })
      .toBe(n);
    expect(await page.evaluate(() => (window as unknown as { __odd: string[] }).__odd)).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(dv).toHaveAttribute("data-flow", "paused");
    await dv.locator(".hl-fig").evaluate((f) => f.scrollIntoView({ block: "center" }));
    await expect(dv).toHaveAttribute("data-flow", "running");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(dv).toHaveAttribute("data-flow", "paused");
  });

/** Computed opacity of every animated layer, per highlight. Runs in the page. */
const layers = () =>
  [...document.querySelectorAll(".fig .lit, .fig .xm, .fig .base, .fig .dot")].map(
    (e) => getComputedStyle(e).opacity,
  );

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  for (const slug of SLUGS)
    test(`${slug} highlights: no loop, the same static scene as without JS`, async ({
      page,
      browser,
    }) => {
      await page.goto(`/work/${slug}/`);
      await page.locator("article.hl-dv").last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await expect(page.locator("article.hl-dv[data-flow]")).toHaveCount(0);
      await expect(page.locator(".hl-mk.is-now, li.st.is-now")).toHaveCount(0);
      const reduce = await page.evaluate(layers);
      const ctx = await browser.newContext({
        javaScriptEnabled: false,
        viewport: page.viewportSize() ?? undefined,
      });
      const nojs = await ctx.newPage();
      await nojs.goto(page.url());
      expect(reduce).toEqual(await nojs.evaluate(layers));
      await ctx.close();
    });
});

test("case studies load no external scripts or styles", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://localhost").origin;
  const external: string[] = [];
  page.on("request", (r) => {
    const t = r.resourceType();
    if ((t === "script" || t === "stylesheet") && new URL(r.url()).origin !== origin)
      external.push(r.url());
  });
  for (const slug of SLUGS) {
    await page.goto(`/work/${slug}/`);
    await page.locator("#deep-dives").scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
  }
  expect(external).toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  for (const slug of SLUGS)
    test(`${slug} highlights: the static scene, an ordered list for screen readers`, async ({
      page,
    }) => {
      await page.goto(`/work/${slug}/`);
      for (const dv of await page.locator("article.hl-dv").all()) {
        const n = Number(await dv.getAttribute("data-n"));
        const fig = dv.locator("figure.hl-fig");
        await expect(fig).toHaveAttribute("role", "img");
        await expect(fig).toHaveAttribute(
          "aria-label",
          new RegExp(`The ${n} numbered parts are listed next to the drawing\\.$`),
        );
        await expect(fig.locator("svg:visible")).toHaveCount(1);
        await expect(fig.locator("svg").first()).toHaveAttribute("aria-hidden", "true");
        // the steps stay an ordered list for screen readers (list-style: none must not drop the role)
        const ol = dv.locator("ol.cs2-steps");
        await expect(ol).toHaveRole("list");
        await expect(ol.locator(":scope > li")).toHaveCount(n);
        for (const li of await ol.locator(":scope > li").all())
          await expect(li).toHaveRole("listitem");
        await expect(fig.locator(".hl-mk:visible")).toHaveCount(n);
      }
      await open(page);
      expect(await page.evaluate(audit)).toEqual([]);
      expect(await page.evaluate(markers)).toEqual([]);
    });
});
