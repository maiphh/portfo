/** Build-time Worker settings (PUBLIC_* only). */
import { USE_MOCKS } from "~/lib/flags";

/** Accepts `https://host` or a bare host. A bare host is treated as https. */
export function workerOrigin(raw: string | undefined): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

/** Base URL of the portfo Worker, e.g. https://portfo.<account>.workers.dev (no trailing slash). */
export const WORKER_URL: string = workerOrigin(import.meta.env.PUBLIC_WORKER_URL);

/** Sample data while mocks are on, or when no Worker URL is set. */
export const API_MOCK: boolean = USE_MOCKS || WORKER_URL === "";

export const apiUrl = (path: string): string =>
  `${WORKER_URL}${path.startsWith("/") ? path : `/${path}`}`;
