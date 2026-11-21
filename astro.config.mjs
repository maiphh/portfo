// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import { createRequire } from "node:module";

// Resolve Astro's Vite dependency so config reads the same .env files as the build.
const { loadEnv } = await import(
  createRequire(import.meta.resolve("astro/config")).resolve("vite")
);

// Canonical origin: set SITE_URL once a custom domain exists. On Vercel the
// production URL is used automatically; locally it falls back to the dev server.
const site =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:4321");
const supportEnabled =
  (process.env.PUBLIC_SUPPORT_ENABLED ??
    loadEnv(process.env.NODE_ENV || "production", process.cwd(), "PUBLIC_")
      .PUBLIC_SUPPORT_ENABLED) === "true";

// https://astro.build/config
export default defineConfig({
  site,
  // Pages are prerendered (static) by default. Only routes that export
  // `prerender = false` (the /api/* endpoints) run on demand as Vercel functions.
  output: "static",
  adapter: vercel(),
  integrations: [
    mdx(),
    // Retired case-study URLs (pages/work/craftland, mirror-now) only forward the browser.
    sitemap({
      filter: (page) =>
        !/\/work\/(craftland|mirror-now)\/?$/.test(page) &&
        (supportEnabled || !/\/support(?:\/return)?\/?$/.test(page)),
    }),
  ],
  trailingSlash: "ignore",
  prefetch: { prefetchAll: false, defaultStrategy: "hover" },
});
