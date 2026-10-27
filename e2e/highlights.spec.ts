/**
 * The isoglow highlights plates on every case study: no sideways scroll, readable labels and
 * reachable targets, labels that neither collide nor leave their plate, keyboard notes, the no-JS and reduced-motion end states, and no third-party
 * scripts or styles.
 */
import { expect, test } from "@playwright/test";
import { labelLayout } from "./plate-labels";

const SLUGS = ["document-ocr", "legal-rag", "data-validation", "openportfo", "ecom", "poet"];

/** Shown text, label and target sizes inside the highlights section. Runs in the page. */
function audit() {
  const out: string[] = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw)
    out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  const sec = document.querySelector("#deep-dives");
  if (!sec) return ["no #deep-dives"];
  const shown = (el: Element) =>
    el.getClientRects().length > 0 &&
    !el.closest("[hidden], .sr-only, [aria-hidden='true'] svg") &&
    getComputedStyle(el).visibility !== "hidden" &&
    Number(getComputedStyle(el).opacity) > 0;
  for (const el of sec.querySelectorAll(
    ".plate .lb, .plate .cap-top *, .plate .read, .cs2-ctrl *",
  )) {
    if (!shown(el) || !el.textContent?.trim()) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) out.push(`${el.className} "${el.textContent.trim().slice(0, 24)}" ${fs}px`);
  }
  // Shown labels stay on the plate and on screen.
  for (const el of sec.querySelectorAll<HTMLElement>(".plate .lb")) {
    if (!shown(el)) continue;
    const plate = el.closest(".plate");
    if (!plate) continue;
    const r = el.getBoundingClientRect();
    const P = plate.getBoundingClientRect();
    if (r.left < Math.max(P.left, 0) - 1 || r.right > Math.min(P.right, vw) + 1)
      out.push(
        `lb "${el.textContent?.trim()}" spans ${r.left | 0}–${r.right | 0}, plate ${P.left | 0}–${P.right | 0}`,
      );
  }
  // Scene labels are the HTML chips (HIGHLIGHTS-SPEC §5: .lb, b, i). Words printed on the drawing
  // itself (svg text.prn, e.g. the ecom engine tiles) are artwork in an aria-hidden SVG and scale
  // with it, as in the prototype.
  for (const el of sec.querySelectorAll<HTMLElement>("button.lb")) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 24 || r.width < 24)
      out.push(`lb "${el.textContent?.trim()}" ${r.width}x${r.height}`);
  }
  for (const el of sec.querySelectorAll<HTMLElement>(
    ".cs2-ctrl button, .plate .btn, .sheet .x, .cs2-dive summary",
  )) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44) out.push(`target "${el.textContent?.trim().slice(0, 24)}" h ${r.height}`);
  }
  return out;
}

for (const slug of SLUGS)
  for (const width of [320, 360, 390, 430, 768, 1024, 1180, 1440])
    test(`${slug} highlights: sizes and no sideways scroll at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/work/${slug}/`);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
      });
      await page.locator("#deep-dives").scrollIntoViewIfNeeded();
      expect(await page.evaluate(audit)).toEqual([]);
    });

/**
 * Label layout (review 2026-10-27): at phone and narrow-desktop widths, in every mode and at every
 * story step, no two shown labels overlap by more than 3px and every label's text sits at least
 * 4px inside its plate's frame. A failure names the plate, mode, step and labels; fix it with
 * `lab` / `sn` / `sub` on that camera in the case's scenes.ts.
 */
for (const slug of SLUGS)
  for (const width of [320, 360, 390, 430, 1000, 1024, 1100, 1440])
    test(`${slug} highlights: labels clear of each other and the frame at ${width}px`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/work/${slug}/`);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
      });
      expect(await page.evaluate(labelLayout, [3, 4] as [number, number])).toEqual([]);
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

test("a figure label opens its note from the keyboard and Escape returns focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/work/document-ocr/");
  const plate = page.locator(".plate").first();
  await plate.scrollIntoViewIfNeeded();
  const lb = plate.locator("button.lb:visible").first();
  await expect(lb).toBeVisible();
  await lb.focus();
  await page.keyboard.press("Enter");
  const sheet = plate.locator(".sheet");
  await expect(sheet).toBeVisible();
  await expect(lb).toHaveAttribute("aria-expanded", "true");
  await expect(sheet.locator("p")).toHaveText((await lb.getAttribute("data-tip")) ?? "");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(lb).toBeFocused();
  await expect(lb).toHaveAttribute("aria-expanded", "false");
});

test("reduced motion: the steps and modes change the reading at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/work/document-ocr/");
  const dv = page.locator("article.cs2-dv").first();
  await dv.scrollIntoViewIfNeeded();
  const plate = dv.locator(".plate");
  const read = JSON.parse((await plate.getAttribute("data-read")) ?? "{}") as Record<
    string,
    string[]
  >;
  const mode = (await plate.getAttribute("data-mode")) ?? "d";
  const steps = read[mode] ?? [];
  const out = plate.locator("output.read");
  await expect(out).toHaveText(steps.at(-1) ?? "");
  await dv.getByRole("button", { name: "Previous step" }).click();
  await expect(out).toHaveText(steps.at(-2) ?? "");
  await dv.getByRole("button", { name: "Next step" }).click();
  await expect(out).toHaveText(steps.at(-1) ?? "");
  const other = dv.locator(".cs2-ctrl button[data-mode][aria-pressed='false']").first();
  if (await other.count()) {
    const k = (await other.getAttribute("data-mode")) ?? "";
    await other.click();
    await expect(other).toHaveAttribute("aria-pressed", "true");
    await expect(out).toHaveText(read[k]?.at(-1) ?? "");
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  for (const slug of SLUGS)
    test(`${slug} highlights show their end state`, async ({ page }) => {
      await page.goto(`/work/${slug}/`);
      for (const plate of await page.locator(".plate").all()) {
        const read = JSON.parse((await plate.getAttribute("data-read")) ?? "{}") as Record<
          string,
          string[]
        >;
        const mode = (await plate.getAttribute("data-mode")) ?? "d";
        await expect(plate.locator("output.read")).toHaveText(read[mode]?.at(-1) ?? "");
        await expect(plate.locator("svg:visible")).toHaveCount(1);
        await expect(plate.locator("[data-play]")).toBeHidden();
      }
      await expect(page.locator(".cs2-ctrl").first()).toBeHidden();
      expect(await page.evaluate(audit)).toEqual([]);
    });
});
