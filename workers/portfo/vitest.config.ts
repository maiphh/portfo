import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Runs inside workerd (Miniflare) with local D1, the Quota Durable Object and the Rate
// Limiting simulator. Workers AI is mocked: the config does not read wrangler.jsonc, so no
// remote binding or Cloudflare login is used.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      miniflare: {
        compatibilityDate: "2026-10-01",
        d1Databases: ["DB"],
        durableObjects: { QUOTA: { className: "Quota", useSQLite: true } },
        ratelimits: {
          CHAT_BURST_LIMITER: { namespace_id: "1001", simple: { limit: 3, period: 10 } },
        },
        bindings: {
          ALLOWED_ORIGINS: "https://site.test,http://localhost:4321",
          CHAT_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          CHAT_FALLBACK_MODEL: "@cf/meta/llama-3.1-8b-instruct",
          VISITOR_LIMIT: "10",
          DAILY_MESSAGE_CAP: "50",
          MAX_TOOL_ROUNDS: "3",
          MAX_TOKENS: "400",
          SESSION_SIGNING_KEY: "test-session-key",
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
