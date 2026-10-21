import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Runs inside workerd (Miniflare) with a local D1. Resend and GitHub are mocked.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      miniflare: {
        compatibilityDate: "2026-10-01",
        d1Databases: ["DB"],
        bindings: {
          ALLOWED_ORIGINS: "https://site.test,http://localhost:4321",
          VISITOR_HASH_SALT: "test-visitor-salt",
          RESEND_API_KEY: "test-resend-key",
          NOTIFY_EMAIL: "phu@example.com",
          CRON_SECRET: "test-cron-secret",
          GITHUB_TOKEN: "test-github-token",
          GITHUB_LOGIN: "maiphh",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
