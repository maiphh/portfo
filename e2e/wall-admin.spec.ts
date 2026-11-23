import { expect, test } from "@playwright/test";
import sharp from "sharp";

const initialPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "";
const rotatedPassword = `${crypto.randomUUID()} rotated`;
const workerOrigin = process.env.WALL_ADMIN_WORKER_URL ?? "http://127.0.0.1:8877";

test("separate visitor and owner contexts review, edit, publish, and rotate password", async ({
  browser,
  baseURL,
}) => {
  const ownerContext = await browser.newContext();
  const olderContext = await browser.newContext();
  const visitorContext = await browser.newContext();
  const admin = await ownerContext.newPage();
  const older = await olderContext.newPage();
  const visitor = await visitorContext.newPage();
  const login = async (page: typeof admin) => {
    await page.goto(`${baseURL}/login`);
    await page.getByLabel("Password").fill(initialPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/wall$/);
  };
  await login(admin);
  await login(older);
  await expect(admin.locator(".owner-draft")).toContainText("Draft ready");
  await admin.getByRole("button", { name: "+ Folder", exact: true }).click();
  await admin.getByLabel("Folder name").fill("Guest memories");
  await admin.getByRole("button", { name: "Create folder" }).click();
  await admin.getByRole("button", { name: "Save draft" }).click();
  await expect(admin.locator("#hosted-wall-status")).toContainText("Draft saved");

  const openFolder = async (page: typeof admin) => {
    await page.locator(".wall-item.folder").filter({ hasText: "Guest memories" }).click();
    await page.getByRole("button", { name: "Open folder", exact: true }).click();
  };

  await visitor.goto(`${baseURL}/wall`);
  await visitor.getByRole("button", { name: "Contribute" }).click();
  await visitor.locator("#contribution-kind").selectOption("photo");
  await visitor.locator("#contribution-title").fill("Visitor photo");
  await visitor.locator("#contribution-body").fill("A visitor caption");
  await visitor.locator("#contribution-alt").fill("A tiny local test image");
  await visitor.locator("#contribution-photo").setInputFiles({
    name: "visitor.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 24, height: 16, channels: 3, background: "#b17940" },
    })
      .png()
      .toBuffer(),
  });
  await visitor.locator("#wall-contribution button[type=submit]").click();
  await expect(visitor.locator("#contribution-status")).toContainText("owner will review");

  await visitor.getByRole("button", { name: "Close", exact: true }).click();
  await visitor.locator("#wall-contribute").click();
  await visitor.locator("#contribution-kind").selectOption("note");
  await visitor.locator("#contribution-title").fill("Visitor rejected note");
  await visitor.locator("#contribution-body").fill("Keep this out of the public wall.");
  await visitor.route(
    "**/api/wall/submissions",
    async (route) => {
      expect((await route.fetch()).status()).toBe(201);
      await route.abort();
    },
    { times: 1 },
  );
  await visitor.locator("#wall-contribution button[type=submit]").click();
  await expect(visitor.locator("#contribution-status")).toContainText("Unable to connect");
  await visitor.locator("#wall-contribution button[type=submit]").click();
  await expect(visitor.locator("#contribution-status")).toContainText("owner will review");

  await admin.getByRole("link", { name: "Submissions" }).click();
  const photoCard = admin
    .locator(".owner-submission")
    .filter({ has: admin.getByRole("heading", { name: "Visitor photo", exact: true }) });
  const rejectedCard = admin
    .locator(".owner-submission")
    .filter({ has: admin.getByRole("heading", { name: "Visitor rejected note", exact: true }) });
  await expect(photoCard).toBeVisible();
  await expect(photoCard.locator("img")).toHaveJSProperty("complete", true);
  await expect
    .poll(async () =>
      photoCard.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  const queuedMedia = await photoCard.locator("img").getAttribute("src");
  expect(queuedMedia).toMatch(/^\/api\/admin\/wall\/media\/[a-f0-9]{64}\/thumbnail$/);
  const publicMedia = `${workerOrigin}${queuedMedia?.replace("/api/admin", "")}`;
  const prepublish = await visitor.request.get(`${baseURL}${queuedMedia}`);
  expect(prepublish.status()).toBe(401);
  expect((await visitor.request.get(publicMedia)).status()).toBe(404);
  const privatePreview = await admin.request.get(`${baseURL}${queuedMedia}`);
  expect(privatePreview.status()).toBe(200);

  await photoCard.getByLabel("Destination folder").selectOption({ label: "Guest memories" });
  await photoCard.getByRole("button", { name: "Accept" }).click();
  await expect(admin.locator("#submission-feedback")).toContainText("Accepted and added");
  expect((await visitor.request.get(publicMedia)).status()).toBe(404);
  await rejectedCard.getByRole("button", { name: "Reject" }).click();
  await expect(admin.locator("#submission-feedback")).toContainText("Submission rejected");

  await admin.getByLabel("Show").selectOption("rejected");
  await expect(
    admin.getByRole("heading", { name: "Visitor rejected note", exact: true }),
  ).toBeVisible();
  await admin.getByLabel("Show").selectOption("accepted");
  await expect(admin.getByRole("heading", { name: "Visitor photo", exact: true })).toBeVisible();
  await admin.getByLabel("Show").selectOption("pending");
  await expect(admin.locator("#submission-feedback")).toContainText("No pending submissions.");

  await admin.getByRole("link", { name: "Editor" }).click();
  await openFolder(admin);
  const card = admin
    .locator(".wall-item.photo")
    .filter({ has: admin.locator(".item-label", { hasText: "Visitor photo" }) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit Visitor photo" }).click();
  await admin.locator("#item-x").fill("420");
  await admin.locator("#item-y").fill("310");
  await admin.locator("#wall-editor button[type=submit]").click();
  await admin.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(admin.locator("#hosted-wall-status")).toContainText("Previewing");
  await expect(card).toHaveCSS("left", "420px");
  await admin.getByRole("button", { name: "Preview", exact: true }).click();
  await admin.getByRole("button", { name: "Save draft" }).click();
  await expect(admin.locator("#hosted-wall-status")).toContainText("Draft saved");
  await admin.reload();
  await expect(admin.locator(".wall-item.photo").filter({ hasText: "Visitor photo" })).toHaveCSS(
    "left",
    "420px",
  );
  await admin.getByRole("button", { name: "Publish" }).click();
  await expect(admin.locator("#hosted-wall-status")).toContainText("Published");
  expect((await visitor.request.get(publicMedia)).status()).toBe(200);
  const publishedWall = await visitor.request.get(`${workerOrigin}/wall`);
  expect(publishedWall.ok()).toBe(true);
  const { items } = (await publishedWall.json()) as { items: Array<{ title: string }> };
  expect(items.map((item) => item.title)).toEqual(["Guest memories", "Visitor photo"]);
  await visitor.reload();
  await openFolder(visitor);
  const publishedPhoto = visitor.locator(".wall-item.photo").filter({ hasText: "Visitor photo" });
  await expect(publishedPhoto).toBeVisible();
  await expect(publishedPhoto).toHaveCSS("left", "420px");
  await expect(publishedPhoto).toHaveCSS("top", "310px");
  await publishedPhoto.click();
  await expect(visitor.getByText("A visitor caption")).toBeVisible();

  await admin.getByRole("link", { name: "Change password", exact: true }).click();
  await admin.getByLabel("Current password").fill(initialPassword);
  await admin.getByLabel("New password", { exact: true }).fill(rotatedPassword);
  await admin.getByLabel("Confirm new password").fill(rotatedPassword);
  await admin.getByRole("button", { name: "Change password" }).click();
  await expect(admin.locator("[data-form-status]")).toContainText(
    "other sessions have been signed out",
  );
  await older.reload();
  await expect(older).toHaveURL(/\/login$/);
  await admin.goto(`${baseURL}/admin/wall`);
  await expect(admin.locator(".owner-draft")).toContainText("Draft ready");
  await admin.getByRole("button", { name: "Sign out" }).click();
  await expect(admin).toHaveURL(/\/login$/);
  await admin.getByLabel("Password").fill(initialPassword);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await expect(admin.locator("[data-form-status]")).toContainText("Invalid password");
  await admin.getByLabel("Password").fill(rotatedPassword);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await expect(admin).toHaveURL(/\/admin\/wall$/);
  await Promise.all([ownerContext.close(), olderContext.close(), visitorContext.close()]);
});
