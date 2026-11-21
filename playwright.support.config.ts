import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_SUPPORT_PORT ?? 4400);
export default defineConfig({
  testDir: "e2e",
  testMatch: "support.spec.ts",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    ...(process.env.PW_CHROME && {
      launchOptions: { executablePath: process.env.PW_CHROME, args: ["--no-sandbox"] },
    }),
  },
  webServer: {
    command: "node scripts/preview.mjs",
    env: { PORT: String(port) },
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
  },
});
