import { chromium } from "@playwright/test";

const crossingsOf = (fid) => {
  const flow = document.querySelector(`[data-flow="${fid}"]`);
  const o = flow.getBoundingClientRect();
  const rel = (r) => ({
    l: r.left - o.left,
    t: r.top - o.top,
    r: r.right - o.left,
    b: r.bottom - o.top,
  });
  const nodes = [...flow.querySelectorAll("[data-node]")].map((n) => ({
    id: n.dataset.node,
    r: rel(n.getBoundingClientRect()),
  }));
  const bad = [];
  for (const p of flow.querySelectorAll("svg.flow-edges path")) {
    const len = p.getTotalLength();
    for (const n of nodes) {
      if (n.id === p.dataset.a || n.id === p.dataset.b) continue;
      for (let at = 0; at <= len; at += 2) {
        const q = p.getPointAtLength(at);
        if (q.x > n.r.l + 2 && q.x < n.r.r - 2 && q.y > n.r.t + 2 && q.y < n.r.b - 2) {
          bad.push(`${p.dataset.a}->${p.dataset.b} through ${n.id}`);
          break;
        }
      }
    }
  }
  return {
    bad,
    dashed: flow.querySelectorAll("path.dashed").length,
    groups: [...flow.querySelectorAll(".flow-groupbox")].map((g) => g.textContent),
  };
};

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (res) => {
  if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
});
await page.goto("http://localhost:4321/work/data-validation/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.evaluate(() => document.fonts.ready);

const headings = await page.locator("#how-it-works .cs2-how-sub > h3").allTextContents();
const videoDesc = await page.locator("#vid-desc").count();
const dives = await page.locator("[data-dive] summary h3").allTextContents();
await page.locator('[data-flow="app"]').scrollIntoViewIfNeeded();
await page.waitForFunction(
  () => document.querySelector('[data-flow="app"]')?.getAttribute("data-auto") === "running",
  null,
  { timeout: 4000 },
);
const wide = await page.evaluate(crossingsOf, "app");
await page.locator('[data-flow="app"] [data-node="month"]').click();
const detail = (await page.locator("#app-detail h3").first().innerText())
  .replace(/\s+/g, " ")
  .trim();
const paused = await page.locator('[data-flow="app"]').getAttribute("data-auto");

await page.setViewportSize({ width: 390, height: 844 });
await page.locator('[data-flow="app"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const phone = await page.evaluate(crossingsOf, "app");

console.log(
  JSON.stringify({ errors, headings, videoDesc, dives, detail, paused, wide, phone }, null, 2),
);
await browser.close();
