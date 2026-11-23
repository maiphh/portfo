import type { APIRoute } from "astro";
import { adminApi } from "~/lib/wall-admin/gateway";

export const prerender = false;
export const ALL: APIRoute = adminApi;
