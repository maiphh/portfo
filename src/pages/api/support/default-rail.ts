import type { APIRoute } from "astro";
import { defaultRailForCountry } from "~/lib/support/pricing";

export const prerender = false;

export const GET: APIRoute = ({ request }) =>
  Response.json(
    { defaultRail: defaultRailForCountry(request.headers.get("x-vercel-ip-country")) },
    { headers: { "Cache-Control": "no-store" } },
  );
