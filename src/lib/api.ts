/** Build-time API Worker settings (PUBLIC_* only). */
import { USE_MOCKS } from "~/lib/flags";

/** Base URL of the portfo-api Worker, e.g. https://portfo-api.<account>.workers.dev (no trailing slash). */
export const API_URL: string = (import.meta.env.PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");

/** Sample data while mocks are on, or when no Worker URL is set. */
export const API_MOCK: boolean = USE_MOCKS || API_URL === "";

export const apiUrl = (path: string): string =>
  `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
