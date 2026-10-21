/** Calendar-day helpers in the site's time zone (Asia/Ho_Chi_Minh, UTC+7, no DST). */
export const SITE_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DAY_MS = 24 * 60 * 60_000;

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SITE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD of `at` in Asia/Ho_Chi_Minh. */
export function saigonDate(at: Date | string): string {
  return fmt.format(typeof at === "string" ? new Date(at) : at);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function saigonMidnight(date: string): string {
  return new Date(`${date}T00:00:00+07:00`).toISOString();
}
