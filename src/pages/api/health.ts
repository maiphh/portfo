import type { APIRoute } from "astro";
import { USE_MOCKS } from "~/lib/flags";

/**
 * On-demand (Vercel function). The /api routes for chat, contact, views and the GitHub
 * sync land in later PRs (see docs/architecture.md); this one proves the wiring.
 */
export const prerender = false;

export const GET: APIRoute = () =>
  Response.json(
    {
      ok: true,
      mocks: USE_MOCKS,
      features: { ask: false, contact: false, views: false, github: false },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
