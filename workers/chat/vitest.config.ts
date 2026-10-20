import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Runs the tests inside workerd (Miniflare) with the real Durable Object and Rate Limiting
// simulators. Workers AI, Vectorize, Turnstile and the site APIs are always mocked: the
// config does not read wrangler.jsonc, so no remote binding or Cloudflare login is used.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      miniflare: {
        compatibilityDate: "2026-10-01",
        durableObjects: { QUOTA: { className: "Quota", useSQLite: true } },
        ratelimits: {
          CHAT_BURST_LIMITER: { namespace_id: "1001", simple: { limit: 3, period: 10 } },
        },
        bindings: {
          ALLOWED_ORIGINS: "https://site.test,http://localhost:4321",
          SITE_URL: "https://site.test",
          VISITOR_LIMIT: "10",
          DAILY_MESSAGE_CAP: "50",
          TURNSTILE_SECRET_KEY: "test-turnstile-secret",
          INGEST_SECRET: "test-ingest-secret",
          SESSION_SIGNING_KEY: "test-session-key",
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
