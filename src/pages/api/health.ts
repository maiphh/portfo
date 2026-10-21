import type { APIRoute } from "astro";
import { USE_MOCKS } from "~/lib/flags";

/**
 * On-demand (Vercel function); proves the /api wiring still works.
 * Contact, views, GitHub and chat live on the portfo Cloudflare Worker.
 */
export const prerender = false;

export const GET: APIRoute = () =>
  Response.json(
    {
      ok: true,
      mocks: USE_MOCKS,
      features: { chat: true, contact: true, views: true, github: true },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
