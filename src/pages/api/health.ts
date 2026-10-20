import type { APIRoute } from "astro";
import { USE_MOCKS } from "~/lib/flags";

/**
 * On-demand (Vercel function); proves the /api wiring. The chat is not an /api route:
 * it runs as the separate Cloudflare Worker in workers/chat (not deployed yet).
 */
export const prerender = false;

export const GET: APIRoute = () =>
  Response.json(
    {
      ok: true,
      mocks: USE_MOCKS,
      features: { chat: false, contact: true, views: true, github: true },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
