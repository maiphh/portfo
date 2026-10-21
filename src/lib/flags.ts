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
