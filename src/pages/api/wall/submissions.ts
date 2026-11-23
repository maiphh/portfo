import type { APIRoute } from "astro";
import { publicSubmission } from "~/lib/wall-admin/gateway";

export const prerender = false;
export const ALL: APIRoute = publicSubmission;
