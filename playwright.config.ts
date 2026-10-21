/**
 * Browser tests against the built static site (`pnpm build` first). The chat runs on its mock
 * stream (PUBLIC_USE_MOCKS defaults on), so no Worker or network is needed.
 * Locally, PW_CHROME=/usr/bin/google-chrome uses an installed Chrome instead of the bundled one.
 */
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4399);
const chrome = process.env.PW_CHROME;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    ...(chrome && { launchOptions: { executablePath: chrome, args: ["--no-sandbox"] } }),
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `node scripts/preview.mjs`,
    env: { PORT: String(port) },
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
