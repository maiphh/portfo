import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const want = {
  "/work/openportfo/": [
    "A chat agent that works on your portfolio",
    "News is fetched from RSS",
    "Updates go out by email",
  ],
  "/work/ecom/": [
    "The shop takes a real payment",
    "The seller runs the shop from an admin desk",
    "A new store is a new front, not a new engine",
  ],
  "/work/poet/": ["A gift is a real PayOS payment", "A donor is shown on the site"],
  "/work/document-ocr/": ["New document types are templates, not code changes"],
};
const gone = [
  "Lambda is a clock",
  "The shop is not a Next.js app",
  "Plain pages, one origin",
  "Deep dives",
];
const out = {};
for (const [url, titles] of Object.entries(want)) {
  await page.goto(`http://localhost:4321${url}`, { waitUntil: "domcontentloaded" });
  const h = await page.locator("#deep-dives h2").innerText();
  const rail = await page.locator('[data-rail] a[href="#deep-dives"]').innerText();
  const got = await page.locator("#deep-dives h3").allTextContents();
  const text = await page.locator("main").innerText();
  out[url] = {
    h,
    rail,
    got,
    missing: titles.filter((t) => !got.includes(t)),
    stale: gone.filter((t) => text.includes(t)),
  };
}
console.log(JSON.stringify({ errors, out }, null, 2));
await browser.close();
