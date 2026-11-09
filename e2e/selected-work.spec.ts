import { expect, test, type Page } from "@playwright/test";
import { overflowReport } from "./overflow";

const media = (page: Page) => page.locator("#sw-ocr-video");
const frame = (page: Page) => page.locator("button.sw-video-frame");
const playing = async (page: Page, value: boolean) => {
  await expect(frame(page)).toHaveAttribute("aria-pressed", String(value));
  await expect(frame(page)).toHaveAccessibleName(value ? "Pause demo" : "Play demo");
  await expect.poll(() => media(page).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(value);
};
const showVideo = async (page: Page) => {
  await page.goto("/");
  await media(page).scrollIntoViewIfNeeded();
  await expect(frame(page)).toBeVisible();
};

test("editorial structure, real destinations and existing anchors", async ({ page, request }) => {
  await page.goto("/");
  const work = page.locator("#work[data-selected-work]");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(work.getByRole("heading", { level: 2, name: "Selected work" })).toBeVisible();
  await expect(work.locator("video")).toHaveCount(1);
  await expect(work.locator(".sw-list > li")).toHaveCount(6);
  await expect(work.locator(".sw-list img, .sw-list video, .sw-list canvas")).toHaveCount(0);
  await expect(
    work.locator(
      ".chapter, .steps, .stage, .pin-spacer, [data-most], [data-views], .video-toolbar",
    ),
  ).toHaveCount(0);
  for (const [id, slug] of [
    ["ocr", "document-ocr"],
    ["rag", "legal-rag"],
    ["validation", "data-validation"],
    ["craftland", "craftland"],
    ["openportfo", "openportfo"],
    ["ecom", "ecom"],
    ["poet", "poet"],
  ] satisfies [string, string][]) {
    await expect(work.locator(`#work-${id}`)).toHaveAttribute("data-slug", slug);
  }
  const links = work.locator('a[href^="/work/"]:not(.sw-native-link)');
  await expect(links).toHaveCount(6);
  for (const link of await links.all()) {
    const href = await link.getAttribute("href");
    expect(href).not.toMatch(/craftland|mirror-now/);
    expect((await request.get(href ?? "")).status()).toBe(200);
  }
  await expect(work.locator(".sw-result-block")).toContainText("Two months after go-live");
  await expect(work.locator(".sw-results")).toContainText("8,000");
  await expect(work.locator(".sw-results")).toContainText("99.6%");
  await expect(work.locator(".sw-results")).toContainText("About 300");
  await expect(work.locator(".sw-demo-description")).toHaveText("Demo uses synthetic values.");
});

test("whole-frame click, Space and Enter each toggle once, with persistent pause cue", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await showVideo(page);
  await playing(page, true);
  await expect
    .poll(() => media(page).evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  await frame(page).click();
  await playing(page, false);
  const time = await media(page).evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.waitForTimeout(850);
  expect(await media(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(time, 1);
  await expect(page.locator(".sw-feedback")).toHaveCSS("opacity", "0");
  await expect(page.locator(".sw-paused-cue")).toBeVisible();
  await frame(page).focus();
  const scroll = await page.evaluate(() => scrollY);
  await page.keyboard.press("Space");
  await playing(page, true);
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await page.keyboard.press("Enter");
  await playing(page, false);
  await expect(frame(page)).toBeFocused();
  await expect(frame(page)).toHaveCSS("outline-width", "3px");
  await frame(page).click();
  await playing(page, true);
  expect(errors).toEqual([]);
});

test("offscreen pauses, automatic return resumes, explicit pause survives return", async ({
  page,
}) => {
  await showVideo(page);
  await playing(page, true);
  await page.locator("#work-poet").scrollIntoViewIfNeeded();
  await playing(page, false);
  await media(page).scrollIntoViewIfNeeded();
  await playing(page, true);
  await frame(page).click();
  await playing(page, false);
  await page.locator("#work-poet").scrollIntoViewIfNeeded();
  await media(page).scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await playing(page, false);
});

test("reduced motion: exact poster, explicit play, leave resets consent, preference updates", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await showVideo(page);
  await playing(page, false);
  await expect(page.locator(".sw-motion-poster")).toBeVisible();
  await expect(page.locator(".sw-motion-poster")).toHaveAttribute(
    "src",
    "/work/document-ocr/motion-poster.jpg",
  );
  await expect(page.locator(".sw-paused-cue")).toBeVisible();
  await expect(page.locator(".sw-row").first()).toHaveCSS("transition-duration", "0s");
  await frame(page).click();
  await playing(page, true);
  await expect(page.locator(".sw-motion-poster")).toBeHidden();
  await page.locator("#work-poet").scrollIntoViewIfNeeded();
  await playing(page, false);
  await media(page).scrollIntoViewIfNeeded();
  await playing(page, false);
  await expect(page.locator(".sw-motion-poster")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".sw-motion-poster")).toBeHidden();
  // The existing hero restarts on a motion-preference change; restore visibility gating.
  await media(page).scrollIntoViewIfNeeded();
  await playing(page, true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await playing(page, false);
  await expect(page.locator(".sw-motion-poster")).toBeVisible();
});

test("Craftland is a native keyboard disclosure, not a redirect link", async ({ page }) => {
  await page.goto("/");
  const details = page.locator("details#work-craftland");
  const summary = details.locator("summary");
  await expect(details.locator("a")).toHaveCount(0);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect(details.locator(".sw-craftland-body")).toContainText(
    "From December 2023 to September 2025",
  );
  await page.keyboard.press("Space");
  await expect(details).not.toHaveAttribute("open", "");
});

for (const width of [320, 360, 390, 414, 430, 768, 1024, 1280, 1440]) {
  test(`work fits ${width}px: no overflow, 12px text, 44px targets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#work-craftland summary").click();
    expect(await page.evaluate(overflowReport, "#work")).toEqual([]);
    for (const target of await page
      .locator("#work .sw-row, #work .sw-explore, #work button")
      .all()) {
      expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
}

test("200% layout and long row copy wrap without hiding overflow", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto("/");
  await page
    .locator(".sw-row-project h3")
    .first()
    .evaluate((el) => (el.textContent = "A meaningful longer project name with longer words"));
  expect(await page.evaluate(overflowReport, "#work")).toEqual([]);
});

test("no JS: native video controls, readable rows and Craftland disclosure", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await media(page).scrollIntoViewIfNeeded();
  expect(await media(page).evaluate((v: HTMLVideoElement) => v.controls && !v.autoplay)).toBe(true);
  await expect(frame(page)).toHaveCount(0);
  await expect(page.locator(".sw-native-link")).toBeVisible();
  await expect(page.locator(".sw-row")).toHaveCount(6);
  await media(page).evaluate((v: HTMLVideoElement) => v.play());
  // Driver-side reads work even when document rAF is disabled.
  const t = await media(page).evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.waitForTimeout(350);
  expect(await media(page).evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(t);
  await media(page).evaluate((v: HTMLVideoElement) => v.pause());
  expect(await media(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.locator("#work-craftland summary").click();
  await expect(page.locator("#work-craftland")).toHaveAttribute("open", "");
  expect(await page.evaluate(overflowReport, "#work")).toEqual([]);
  await context.close();
});

test("media error leaves a named control, summary and fallback", async ({ page }) => {
  await page.route("**/document-ocr/motion.mp4", (route) =>
    route.fulfill({ status: 404, body: "Missing" }),
  );
  await showVideo(page);
  await frame(page).click();
  await expect(page.locator(".sw-native-link")).toBeVisible();
  await expect(frame(page)).toHaveAccessibleName("Play demo");
  await expect(page.locator(".sw-featured-copy")).toContainText("8,000");
});

test("preview serves single, open and suffix ranges, HEAD, seeks and 416", async ({
  page,
  request,
}) => {
  const url = "/work/document-ocr/motion.mp4";
  const full = await request.head(url);
  expect(full.status()).toBe(200);
  expect(full.headers()["content-type"]).toBe("video/mp4");
  expect(full.headers()["accept-ranges"]).toBe("bytes");
  const size = Number(full.headers()["content-length"]);
  for (const [range, start, end] of [
    ["bytes=0-99", 0, 99],
    ["bytes=100-", 100, size - 1],
    ["bytes=-100", size - 100, size - 1],
  ]) {
    const response = await request.get(url, { headers: { Range: String(range) } });
    expect(response.status()).toBe(206);
    expect(response.headers()["content-range"]).toBe(`bytes ${start}-${end}/${size}`);
    expect((await response.body()).length).toBe(Number(end) - Number(start) + 1);
  }
  const head = await request.head(url, { headers: { Range: "bytes=20-29" } });
  expect(head.status()).toBe(206);
  expect(head.headers()["content-length"]).toBe("10");
  expect((await head.body()).length).toBe(0);
  for (const range of [
    "bytes=9-2",
    `bytes=${size}-`,
    "bytes=-0",
    "bytes=",
    "bytes=0-2,4-6",
    "invalid",
  ]) {
    const response = await request.get(url, { headers: { Range: range } });
    expect(response.status()).toBe(416);
    expect(response.headers()["content-range"]).toBe(`bytes */${size}`);
  }
  await showVideo(page);
  await media(page).evaluate((v: HTMLVideoElement) => (v.currentTime = 9.5));
  await expect
    .poll(() => media(page).evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThanOrEqual(9.4);
});

for (const settlement of ["resolve", "reject"]) {
  test(`stale ${settlement} cannot override a newer allowed real-media play`, async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLMediaElement.prototype.play;
      let first = true;
      HTMLMediaElement.prototype.play = function () {
        const actual = original.call(this);
        if (!first || this.id !== "sw-ocr-video") return actual;
        first = false;
        // Delay only promise settlement, not real playback or media events.
        void actual.catch(() => {});
        return new Promise<void>((resolve, reject) => {
          window.addEventListener("settle-first-demo-resolve", () => resolve(), { once: true });
          window.addEventListener(
            "settle-first-demo-reject",
            () => reject(new DOMException("Old request blocked", "NotAllowedError")),
            { once: true },
          );
        });
      };
    });
    await showVideo(page);
    await playing(page, true);
    await frame(page).click();
    await playing(page, false);
    await frame(page).click();
    await playing(page, true);
    await page.evaluate(
      (value) => window.dispatchEvent(new Event(`settle-first-demo-${value}`)),
      settlement,
    );
    await page.waitForTimeout(150);
    await playing(page, true);
    await expect(page.locator(".sw-native-link")).toBeHidden();
    await expect(page.locator(".sw-video-message")).toBeEmpty();
  });
}

test("without IntersectionObserver visibility is measured and rows remain readable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "IntersectionObserver");
  });
  await showVideo(page);
  await playing(page, true);
  await page.locator("#work-poet").scrollIntoViewIfNeeded();
  await playing(page, false);
  await media(page).scrollIntoViewIfNeeded();
  await playing(page, true);
  await expect(page.locator(".sw-row").last()).toHaveCSS("opacity", "1");
});

/** Selected work text lines under the docked chat launcher / mascot while it is on screen. */
const mascotOverText = () => {
  const launcher = document.querySelector<HTMLElement>(".chat-launcher");
  if (!launcher) return ["no launcher"];
  const L = launcher.getBoundingClientRect();
  const left = Math.max(L.left, 0);
  const right = Math.min(L.right, document.documentElement.clientWidth);
  const top = Math.max(L.top, 0);
  const bottom = Math.min(L.bottom, innerHeight);
  if (right <= left || bottom <= top || getComputedStyle(launcher).visibility === "hidden")
    return [];
  const hits: string[] = [];
  const walk = document.createTreeWalker(
    document.querySelector("#work") ?? document.body,
    NodeFilter.SHOW_TEXT,
  );
  const range = document.createRange();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.textContent?.trim() || n.parentElement?.closest(".sr-only, [hidden]")) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects())
      if (r.left < right && r.right > left && r.top < bottom && r.bottom > top)
        hits.push(n.textContent.trim().slice(0, 40));
  }
  return hits;
};

for (const width of [320, 360, 390, 414]) {
  test(`the mascot never rests on Selected work text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    // Wait for the ink-dot mascot to replace the placeholder launcher.
    await expect(page.locator(".chat-launcher.has-mascot")).toBeAttached({ timeout: 8000 });
    for (const target of [
      ".sw-featured-index",
      ".sw-featured-role",
      ".sw-demo-description",
      ".sw-results",
      ".sw-explore",
      ".sw-list-heading",
      "#work-rag",
      "#work-craftland",
      "#work-poet",
    ]) {
      // Put the target where the docked launcher sits (bottom right), then let it settle.
      await page
        .locator(target)
        .evaluate((el) => scrollBy(0, el.getBoundingClientRect().bottom - innerHeight + 40));
      await expect.poll(() => page.evaluate(mascotOverText), { message: target }).toEqual([]);
    }
  });
}
