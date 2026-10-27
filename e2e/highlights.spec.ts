/**
 * Highlights v3 (HIGHLIGHTS-SPEC v3 §2–§6), on every case study, after the prototype's
 * verify/check.py: no sideways scroll at 320–1440; text ≥12px (page text and the drawing's words at
 * their rendered size); the drawing's words inside the frame and clear of each other, at rest and
 * through the loop; 44px targets; "The detail" open from 900px and folded under it; one GSAP loop
 * per drawing, running on screen, paused offscreen and in a hidden tab, tweening transform and
 * opacity only (no CSS animations); reduced motion and no-JS show the same static scene; every
 * drawing labelled; no third-party scripts or styles.
 */
import { expect, test, type Page } from "@playwright/test";

const SLUGS = ["document-ocr", "legal-rag", "data-validation", "openportfo", "ecom", "poet"];

type Loop = {
  pause(): void;
  play(): void;
  paused(): boolean;
  repeat(): number;
  duration(): number;
  totalTime(t: number): void;
  getChildren(nested: boolean, tweens: boolean, timelines: boolean): Anim[];
};
type Anim = { vars: Record<string, unknown>; targets(): unknown[] };

/** Page text, targets, focus and "The detail" in the highlights section. Runs in the page. */
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
    getComputedStyle(el).visibility !== "hidden";
  const S = sec.getBoundingClientRect();
  for (const el of sec.querySelectorAll<HTMLElement>(
    "article.hl-dv h3, .hl-n, .hl-cap, .hl-more summary, .hl-more-in p, figure.hl-dv-fig",
  )) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left < Math.max(S.left, 0) - 0.5 || r.right > Math.min(S.right, vw) + 0.5)
      out.push(`${el.className || el.tagName} out of the column ${r.left | 0}–${r.right | 0}`);
    if (el.tagName === "FIGURE" || !el.textContent?.trim()) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12)
      out.push(`${el.className || el.tagName} "${el.textContent.trim().slice(0, 24)}" ${fs}px`);
  }
  const js = document.documentElement.classList.contains("js");
  for (const d of sec.querySelectorAll<HTMLDetailsElement>("details.hl-more")) {
    const s = d.querySelector("summary");
    if (!s) out.push("details without summary");
    else if (!js || vw < 900) {
      const h = s.getBoundingClientRect().height;
      if (h < 44) out.push(`summary target ${h}px`);
    } else if (s.tabIndex !== -1) out.push("summary in the tab order while held open");
  }
  // Nothing in a highlight takes focus, except "The detail" where it can fold (phones, no JS).
  for (const el of sec.querySelectorAll<HTMLElement>(
    "article.hl-dv a, article.hl-dv button, article.hl-dv input, article.hl-dv summary, article.hl-dv [tabindex]",
  )) {
    if (!el.offsetParent || el.tabIndex < 0) continue;
    if (el.tagName === "SUMMARY" && (vw < 900 || !js)) continue;
    out.push(`focusable ${el.tagName.toLowerCase()} in ${el.closest("article")?.id}`);
  }
  return out;
}

/**
 * The drawings' words as rendered now: size (font size × the SVG's scale) ≥12px, inside the
 * drawing (1px), and no two visible ones (opacity >0.05) overlapping by more than 1px.
 */
function words() {
  const out: string[] = [];
  const op = (el: Element) => {
    let o = 1;
    for (let e: Element | null = el; e && e.tagName !== "svg"; e = e.parentElement)
      o *= parseFloat(getComputedStyle(e).opacity);
    return o;
  };
  for (const svg of document.querySelectorAll<SVGSVGElement>("svg.hl-fig")) {
    if (!svg.getClientRects().length) continue;
    const k = svg.dataset.scene;
    const sc = svg.getScreenCTM()?.a ?? 0;
    const F = svg.getBoundingClientRect();
    const ts = [...svg.querySelectorAll("text")].map((t) => ({
      s: (t.textContent ?? "").trim(),
      r: t.getBoundingClientRect(),
      o: op(t),
      px: parseFloat(getComputedStyle(t).fontSize) * sc,
    }));
    for (const t of ts) {
      if (t.px < 12 - 1e-6) out.push(`${k} "${t.s}" ${t.px.toFixed(2)}px`);
      if (t.o <= 0.05) continue;
      if (
        t.r.left < F.left - 1 ||
        t.r.right > F.right + 1 ||
        t.r.top < F.top - 1 ||
        t.r.bottom > F.bottom + 1
      )
        out.push(`${k} "${t.s}" outside the drawing`);
    }
    const v = ts.filter((t) => t.o > 0.05);
    v.forEach((a, i) => {
      for (const b of v.slice(i + 1)) {
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 1 && h > 1) out.push(`${k} "${a.s}" and "${b.s}" overlap ${w | 0}x${h | 0}`);
      }
    });
  }
  return out;
}

/** Hold every loop at t seconds (wrapped by its length). Runs in the page. */
const seek = (t: number) => {
  for (const svg of document.querySelectorAll("svg.hl-fig")) {
    const m = (svg as unknown as { hlLoop?: Loop }).hlLoop;
    if (!m) continue;
    m.pause();
    m.totalTime(t % m.duration());
  }
};

const ready = async (page: Page, slug: string) => {
  await page.goto(`/work/${slug}/`);
  await page.evaluate(() => document.fonts.ready);
};

for (const slug of SLUGS)
  for (const width of [320, 360, 390, 414, 430, 768, 1024, 1180, 1440])
    test(`${slug} highlights: sizes, targets and "The detail" at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await ready(page, slug);
      await page.locator("#deep-dives").scrollIntoViewIfNeeded();
      const open = await page
        .locator("details.hl-more")
        .evaluateAll((ds) => ds.map((d) => (d as HTMLDetailsElement).open));
      expect(open.length).toBeGreaterThanOrEqual(2);
      expect(open).toEqual(open.map(() => width >= 900));
      expect(await page.evaluate(audit)).toEqual([]);
      await page.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
      });
      expect(await page.evaluate(audit)).toEqual([]);
      expect(await page.evaluate(words)).toEqual([]);
    });

for (const slug of SLUGS)
  for (const width of [320, 390, 1440])
    test(`${slug} highlights: words readable and apart through the loop at ${width}px`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize({ width, height: 900 });
      await ready(page, slug);
      const n = await page.locator("article.hl-dv").count();
      await expect(page.locator("svg.hl-fig[data-loop]")).toHaveCount(n);
      for (const t of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]) {
        await page.evaluate(seek, t);
        expect(await page.evaluate(words), `t=${t}s`).toEqual([]);
      }
    });

for (const slug of SLUGS)
  test(`${slug} highlights: one loop per drawing, on screen only, transform and opacity only`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await ready(page, slug);
    const svgs = page.locator("svg.hl-fig");
    const n = await page.locator("article.hl-dv").count();
    expect(n).toBeGreaterThanOrEqual(2);
    await expect(svgs).toHaveCount(n);
    const loops = await svgs.evaluateAll((ss) =>
      ss.map((s) => {
        const m = (s as unknown as { hlLoop?: Loop }).hlLoop;
        return m
          ? {
              repeat: m.repeat(),
              ok: Math.abs(m.duration() - Number((s as SVGElement).dataset.loop)) < 0.01,
            }
          : null;
      }),
    );
    expect(loops).toEqual(Array(n).fill({ repeat: -1, ok: true }));
    // Every tween drives a part's x, y, scale, rotation or opacity (GSAP bookkeeping aside).
    const props = await page.evaluate(() => {
      const ok = new Set(["x", "y", "scaleX", "scaleY", "rotation", "opacity"]);
      const meta = new Set(
        "duration ease transformOrigin svgOrigin immediateRender overwrite data lazy parent repeat repeatDelay delay yoyo".split(
          " ",
        ),
      );
      const bad: string[] = [];
      let tweens = 0;
      for (const s of document.querySelectorAll("svg.hl-fig")) {
        const m = (s as unknown as { hlLoop?: Loop }).hlLoop;
        for (const drive of m?.getChildren(false, true, false) ?? []) {
          const child = drive.targets()[0] as Loop | undefined;
          for (const tw of child?.getChildren(true, true, false) ?? []) {
            const el = tw.targets()[0];
            if (!(el instanceof Element)) continue; // the period pad
            tweens++;
            for (const k of Object.keys(tw.vars))
              if (!ok.has(k) && !meta.has(k)) bad.push(`${el.getAttribute("class")}: ${k}`);
          }
        }
      }
      // no CSS animations or transitions running in a drawing
      const css = document
        .getAnimations()
        .filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest("svg.hl-fig")).length;
      return { tweens, bad, css };
    });
    expect(props.tweens).toBeGreaterThan(0);
    expect(props.bad).toEqual([]);
    expect(props.css).toBe(0);

    const flow = () => svgs.evaluateAll((ss) => ss.map((s) => (s as SVGElement).dataset.hl));
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(flow).toEqual(Array(n).fill("paused"));
    const first = svgs.first();
    await first.evaluate((s) => s.closest("figure")?.scrollIntoView({ block: "center" }));
    await expect(first).toHaveAttribute("data-hl", "running");
    // each drawing runs exactly when ≥15% of its figure is on screen
    await expect
      .poll(() =>
        svgs.evaluateAll((ss) =>
          ss.flatMap((s) => {
            const r = s.closest("figure")?.getBoundingClientRect();
            if (!r) return ["no figure"];
            const seen =
              Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height;
            const want =
              seen >= 0.2 ? "running" : seen <= 0.1 ? "paused" : (s as SVGElement).dataset.hl;
            return (s as SVGElement).dataset.hl === want
              ? []
              : [`${(s as SVGElement).dataset.scene} ${seen.toFixed(2)}`];
          }),
        ),
      )
      .toEqual([]);
    expect(await svgs.evaluateAll((ss) => ss.map((s) => (s as SVGElement).dataset.hl))).toContain(
      "running",
    );
    // it moves: the master's time advances while running
    const t0 = await first.evaluate((s) =>
      (s as unknown as { hlLoop: { totalTime(): number } }).hlLoop.totalTime(),
    );
    await page.waitForTimeout(400);
    const t1 = await first.evaluate((s) =>
      (s as unknown as { hlLoop: { totalTime(): number } }).hlLoop.totalTime(),
    );
    expect(t1).toBeGreaterThan(t0);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(flow).toEqual(Array(n).fill("paused"));
    expect(await first.evaluate((s) => (s as unknown as { hlLoop: Loop }).hlLoop.paused())).toBe(
      true,
    );
    await page.evaluate(() => {
      Reflect.deleteProperty(document, "hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(first).toHaveAttribute("data-hl", "running");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(first).toHaveAttribute("data-hl", "paused");
  });

/** Each drawing's markup and its parts' computed opacity and transform. Runs in the page. */
const still = () =>
  [...document.querySelectorAll("svg.hl-fig")].map((s) => ({
    html: s.outerHTML,
    parts: [...s.querySelectorAll("*")].map((e) => {
      const c = getComputedStyle(e);
      return `${c.opacity} ${c.transform}`;
    }),
  }));

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  for (const slug of SLUGS)
    test(`${slug} highlights: no loop, the same static scene as without JS`, async ({
      page,
      browser,
    }) => {
      await ready(page, slug);
      await page.locator("article.hl-dv").last().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await expect(page.locator("svg.hl-fig[data-hl], svg.hl-fig[data-loop]")).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest("svg.hl-fig"))
              .length,
        ),
      ).toBe(0);
      const reduce = await page.evaluate(still);
      const ctx = await browser.newContext({
        javaScriptEnabled: false,
        viewport: page.viewportSize() ?? undefined,
      });
      const nojs = await ctx.newPage();
      await nojs.goto(page.url());
      expect(reduce).toEqual(await nojs.evaluate(still));
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
    test(`${slug} highlights: the full scene, labelled, "The detail" folded but working`, async ({
      page,
    }) => {
      await page.goto(`/work/${slug}/`);
      const dvs = page.locator("article.hl-dv");
      expect(await dvs.count()).toBeGreaterThanOrEqual(2);
      for (const dv of await dvs.all()) {
        const h = dv.locator("h3");
        await expect(dv).toHaveAttribute("aria-labelledby", (await h.getAttribute("id")) ?? "-");
        const fig = dv.locator("figure.hl-dv-fig");
        await expect(fig).toHaveRole("img");
        expect(((await fig.getAttribute("aria-label")) ?? "").length).toBeGreaterThan(20);
        await expect(fig.locator("svg")).toHaveCount(1);
        await expect(fig.locator("svg")).toBeVisible();
        await expect(fig.locator("svg")).toHaveAttribute("aria-hidden", "true");
        await expect(dv.locator(".hl-cap")).not.toBeEmpty();
        const d = dv.locator("details.hl-more");
        await expect(d).not.toHaveAttribute("open", "");
        await expect(d.locator("summary")).toHaveText("The detail");
        await d.locator("summary").click();
        await expect(d).toHaveAttribute("open", "");
      }
      expect(await page.evaluate(audit)).toEqual([]);
      expect(await page.evaluate(words)).toEqual([]);
    });
});
