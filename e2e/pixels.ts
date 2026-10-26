/** Pixel checks on element screenshots, decoded in a scratch page (works for no-JS pages too). */
import type { Browser, Locator } from "@playwright/test";

/** Luminance standard deviation over a region of `el` given as fractions of its box. A flat
 * fill (e.g. the grey layer native video controls paint before a poster) is close to 0. */
export async function lumaSpread(
  browser: Browser,
  el: Locator,
  r = { x: 0.05, y: 0.08, w: 0.35, h: 0.32 },
): Promise<number> {
  const b = await el.boundingBox();
  if (!b) return -1;
  const buf = await el.page().screenshot({
    clip: {
      x: b.x + b.width * r.x,
      y: b.y + b.height * r.y,
      width: b.width * r.w,
      height: b.height * r.h,
    },
  });
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const sd = await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    if (!g) return -1;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.3 * (d[i] ?? 0) + 0.59 * (d[i + 1] ?? 0) + 0.11 * (d[i + 2] ?? 0);
      s += l;
      s2 += l * l;
      n++;
    }
    const m = s / n;
    return Math.sqrt(Math.max(0, s2 / n - m * m));
  }, buf.toString("base64"));
  await ctx.close();
  return sd;
}
