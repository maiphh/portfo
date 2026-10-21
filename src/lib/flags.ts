/**
 * Feature flags. Read at build time on the server and inlined into client bundles
 * (only PUBLIC_* variables reach the browser).
 */
function readBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return !/^(false|0|off|no)$/i.test(raw.trim());
}

/**
 * While true (the default), backend features render clearly labelled sample data
 * from `src/lib/mocks/*` instead of calling the Workers.
 */
export const USE_MOCKS: boolean = readBool(import.meta.env.PUBLIC_USE_MOCKS, true);

/**
 * Case-study "motion cut" (the project's promo video), per page. A video renders only for the
 * slugs listed here, each one approved by Phu: Document OCR (2026-10-21). DVP's video was never
 * approved. PUBLIC_CASE_VIDEO overrides the list (comma-separated slugs; empty = none).
 */
export const CASE_VIDEOS: ReadonlySet<string> = new Set(
  (/^(false|0|off|no)$/i.test(import.meta.env.PUBLIC_CASE_VIDEO ?? "")
    ? ""
    : (import.meta.env.PUBLIC_CASE_VIDEO ?? "document-ocr")
  )
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean),
);
