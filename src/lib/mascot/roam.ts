/**
 * Roaming geometry for the mascot at ≥1280px: it lives in the side margins outside the
 * content column, never across it. Pure, so the bounds are unit tested.
 */
import type { Box } from "~/lib/chat/geometry";

export interface Lane {
  side: "L" | "R";
  /** Allowed left edge of the mascot box, inclusive. */
  x0: number;
  x1: number;
  /** The content edge this lane borders. */
  edge: number;
}

export const ROAM_MIN = 44; // tap target floor
export const ROAM_MAX = 56;
export const LANE_GAP = 3; // from the viewport edge and from the content edge

/**
 * The mascot's roaming size: as big as the wider margin allows, from 44 to 56px.
 * null when even 44px doesn't fit (then it docks).
 */
export function roamSize(
  content: { left: number; right: number },
  vw: number,
  gap = LANE_GAP,
): number | null {
  const room = Math.max(content.left, vw - content.right) - 2 * gap;
  if (room < ROAM_MIN) return null;
  return Math.min(ROAM_MAX, Math.floor(room));
}

export function lanes(
  content: { left: number; right: number },
  vw: number,
  size: number,
  gap = LANE_GAP,
): Lane[] {
  const out: Lane[] = [];
  const lx1 = content.left - gap - size;
  if (lx1 >= gap) out.push({ side: "L", x0: gap, x1: lx1, edge: content.left });
  const rx0 = content.right + gap;
  const rx1 = vw - gap - size;
  if (rx1 >= rx0) out.push({ side: "R", x0: rx0, x1: rx1, edge: content.right });
  return out;
}

/** True when a mascot box at x lies fully inside one of the lanes (or off-screen, entering). */
export function inMargins(x: number, size: number, ls: Lane[], vw: number): boolean {
  if (x + size <= 0 || x >= vw) return true;
  return ls.some((l) => x >= l.x0 - 0.5 && x <= l.x1 + 0.5);
}

export const clampToLane = (x: number, l: Lane) => Math.min(l.x1, Math.max(l.x0, x));

export function yBounds(navBottom: number, vh: number, size: number, margin = 28) {
  return { top: navBottom + margin, bottom: Math.max(navBottom + margin, vh - size - margin) };
}

export const boxAt = (x: number, y: number, size: number): Box => ({
  left: x,
  top: y,
  right: x + size,
  bottom: y + size,
});

export function hitsAny(b: Box, obstacles: Box[], pad = 8): boolean {
  return obstacles.some(
    (r) =>
      r.left < b.right + pad &&
      r.right > b.left - pad &&
      r.top < b.bottom + pad &&
      r.bottom > b.top - pad,
  );
}

export interface Perch {
  x: number;
  y: number;
  lane: Lane;
  weight: number;
}

/**
 * Candidate resting spots in a lane at the given heights, minus any that would sit on content
 * or barely move. `rand` is injectable for tests.
 */
export function perches(
  lane: Lane,
  ys: { y: number; weight: number }[],
  size: number,
  obstacles: Box[],
  current: { x: number; y: number } | null,
  rand: () => number = Math.random,
): Perch[] {
  return ys
    .map((c) => ({ x: lane.x0 + rand() * (lane.x1 - lane.x0), y: c.y, lane, weight: c.weight }))
    .filter((p) => !hitsAny(boxAt(p.x, p.y, size), obstacles))
    .filter((p) => !current || Math.abs(p.y - current.y) > 40 || Math.abs(p.x - current.x) > 40);
}

export function pick<T extends { weight: number }>(
  c: T[],
  rand: () => number = Math.random,
): T | null {
  const tot = c.reduce((a, p) => a + p.weight, 0);
  let r = rand() * tot;
  for (const p of c) if ((r -= p.weight) <= 0) return p;
  return c[0] ?? null;
}

/**
 * The path between two perches: straight within a lane; via the viewport edges when changing
 * sides, so it never crosses the content column.
 */
export function route(
  from: { x: number; y: number },
  to: Perch,
  vw: number,
  size: number,
): { x: number; y: number; jump?: boolean }[] {
  const fromSide = from.x + size / 2 < vw / 2 ? "L" : "R";
  if (fromSide === to.lane.side) return [{ x: to.x, y: to.y }];
  const off = size + 40;
  const exitX = fromSide === "L" ? -off : vw + off;
  const enterX = to.lane.side === "L" ? -off : vw + off;
  return [
    { x: exitX, y: from.y },
    { x: enterX, y: to.y, jump: true },
    { x: to.x, y: to.y },
  ];
}
