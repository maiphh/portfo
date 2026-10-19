// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";

// Canonical origin: set SITE_URL once a custom domain exists. On Vercel the
// production URL is used automatically; locally it falls back to the dev server.
const site =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:4321");

// https://astro.build/config
export default defineConfig({
  site,
  // Pages are prerendered (static) by default. Only routes that export
  // `prerender = false` (the /api/* endpoints) run on demand as Vercel functions.
  output: "static",
  adapter: vercel(),
  integrations: [mdx(), sitemap()],
  trailingSlash: "ignore",
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
});
