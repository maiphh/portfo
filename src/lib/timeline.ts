/** Maps CV dates onto the 96-month timeline grid (Jan 2021 – Dec 2028). */
export const TL_START_YEAR = 2021;
export const TL_MONTHS = 96;
export const TL_YEARS = Array.from({ length: TL_MONTHS / 12 }, (_, i) => TL_START_YEAR + i);

/** 0-based month index from "YYYY-MM". */
export function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return ((y ?? TL_START_YEAR) - TL_START_YEAR) * 12 + ((m ?? 1) - 1);
}

/** Fractional month index for a date (used for the "now" marker). */
export function nowIndex(now = new Date()): number {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (now.getFullYear() - TL_START_YEAR) * 12 + now.getMonth() + (now.getDate() - 1) / days;
}

/** CSS grid-column value "start/end" for a span, inclusive of the end month. */
export function gridColumn(start: string, end: string | undefined, now = new Date()): string {
  const s = monthIndex(start);
  const e = end ? monthIndex(end) : Math.floor(nowIndex(now));
  return `${s + 1}/${Math.min(TL_MONTHS, e + 1) + 1}`;
}
