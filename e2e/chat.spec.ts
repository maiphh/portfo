import { expect, test, type Page } from "@playwright/test";

/** Records the chat's public events so the mascot API is covered too. */
async function recordEvents(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __chat: { type: string; detail: unknown }[] };
    w.__chat = [];
    for (const type of [
      "portfo-chat:status",
      "portfo-chat:state",
      "portfo-chat:open",
      "portfo-chat:close",
    ])
      document.addEventListener(type, (e) =>
        w.__chat.push({ type, detail: (e as CustomEvent).detail }),
      );
  });
}
const events = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __chat: { type: string; detail: unknown }[] }).__chat,
  );

const launcher = (page: Page) => page.locator("[data-chat-launcher]");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Phu's assistant" });
const input = (page: Page) => page.getByRole("textbox", { name: "Ask about Phu's work" });

async function openFromLauncher(page: Page) {
  await page.goto("/");
  await expect(launcher(page)).toBeVisible();
  // At the top of the page the launcher may be tucked if it would cover text; focus brings it back.
  await launcher(page).focus();
  await launcher(page).press("Enter");
  await expect(dialog(page)).toBeVisible();
}

test("open, send, see status, tokens and sources, then Esc closes and focus returns", async ({
  page,
}) => {
  await recordEvents(page);
  await openFromLauncher(page);
  await expect(input(page)).toBeFocused();
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "true");

  await input(page).fill("How accurate is the OCR pipeline?");
  await input(page).press("Enter");

  const answer = dialog(page).locator(".chat-msg.bot").last();
  await expect(answer.locator(".chat-think")).toContainText("Reading the case study…");
  await expect(dialog(page).locator("[data-chat-status]")).toContainText("Reading the case study…");
  await expect(answer.locator(".ans")).toContainText("vision-language model", {
    timeout: 10_000,
  });
  const chip = answer.getByRole("link", { name: "Document OCR pipeline" });
  await expect(chip).toHaveAttribute("href", "/work/document-ocr");
  await expect(answer.locator(".ans")).not.toHaveAttribute("aria-busy", "true");
  await expect(dialog(page).locator("[data-chat-status]")).toHaveText(/Answers from his CV/);

  const ev = await events(page);
  expect(ev).toContainEqual({
    type: "portfo-chat:status",
    detail: { tool: "get_project", label: "Reading the case study…" },
  });
  const phases = ev
    .filter((e) => e.type === "portfo-chat:state")
    .map((e) => (e.detail as { phase: string }).phase);
  expect(phases).toEqual(expect.arrayContaining(["thinking", "answering", "done"]));

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
  await expect(launcher(page)).toHaveAttribute("aria-expanded", "false");
});

test("focus stays inside the open panel", async ({ page }) => {
  await openFromLauncher(page);
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press(i % 3 ? "Tab" : "Shift+Tab");
    const inside = await page.evaluate(() =>
      document.querySelector("[data-chat]")?.contains(document.activeElement),
    );
    expect(inside).toBe(true);
  }
});

test("history survives a reload; the close button clears it", async ({ page }) => {
  await openFromLauncher(page);
  await dialog(page).getByRole("button", { name: "Work at Garena" }).click();
  await expect(dialog(page).locator(".chat-msg.bot .ans").last()).toContainText("14 game modes", {
    timeout: 10_000,
  });
  await page.reload();
  await launcher(page).focus();
  await launcher(page).press("Enter");
  await expect(dialog(page).locator(".chat-msg.me")).toHaveText(["What did he build at Garena?"]);
  await dialog(page).getByRole("button", { name: "Close chat and clear the conversation" }).click();
  await expect(dialog(page)).toBeHidden();
  const stored = await page.evaluate(() => sessionStorage.getItem("portfo-chat:v1"));
  expect(JSON.parse(stored ?? "{}").messages ?? []).toEqual([]);
});

test("the 500-character cap is enforced with a counter", async ({ page }) => {
  await openFromLauncher(page);
  await input(page).fill("x".repeat(620));
  await expect(input(page)).toHaveValue("x".repeat(500));
  await input(page).dispatchEvent("input");
  await expect(dialog(page).locator("[data-chat-used]")).toHaveText("500");
});

test("friendly errors: rate limit, daily cap and network, with retry where it helps", async ({
  page,
}) => {
  const cases: [string, RegExp, boolean][] = [
    ["rate_limited", /about 7 minutes/, false],
    ["daily_limit", /back tomorrow/, false],
    ["network", /couldn't reach the assistant/i, true],
    ["upstream", /unavailable right now/, true],
  ];
  for (const [scenario, copy, retry] of cases) {
    await page.goto(`/?chat-mock=${scenario}`);
    await page.evaluate(() => sessionStorage.clear());
    await launcher(page).focus();
    await launcher(page).press("Enter");
    await input(page).fill("What has he shipped?");
    await input(page).press("Enter");
    const msg = dialog(page).locator(".chat-msg.bot.is-error").last();
    await expect(msg).toContainText(copy, { timeout: 10_000 });
    await expect(msg.getByRole("button", { name: "Try again" })).toHaveCount(retry ? 1 : 0);
    await expect(page.locator("[data-chat-live]")).toContainText(copy);
  }
});

test("the mobile menu and footer open the chat too", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    await page.locator(".menu summary").click();
    await page.getByRole("button", { name: "Ask my assistant" }).first().click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".menu summary")).toBeFocused();
  } else {
    await page.locator("footer").getByRole("button", { name: "Ask my assistant" }).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.locator("footer").getByRole("button", { name: "Ask my assistant" }),
    ).toBeFocused();
  }
});

test("bottom sheet on mobile, floating panel on desktop", async ({ page, isMobile }) => {
  await openFromLauncher(page);
  await page.waitForTimeout(500);
  const box = await dialog(page).boundingBox();
  const vp = page.viewportSize();
  if (!box || !vp) throw new Error("no box");
  if (isMobile) {
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.width)).toBe(vp.width);
    expect(Math.round(box.y + box.height)).toBe(vp.height);
    await expect(page.locator("[data-chat-scrim]")).toBeVisible();
  } else {
    expect(Math.round(box.width)).toBe(384);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width - 20);
    await expect(page.locator("[data-chat-scrim]")).toBeHidden();
  }
});

test("reduced motion opens and closes without transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFromLauncher(page);
  await expect(dialog(page)).toHaveClass(/is-open/);
  expect(await dialog(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(
    /^0s/,
  );
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
});
