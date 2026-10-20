/** Four dock spots the dragged mascot can rest at. */

export type CornerId = "tl" | "tr" | "bl" | "br";

export interface Spot {
  x: number;
  y: number;
}

export interface CornerPads {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function cornerSpots(
  vw: number,
  vh: number,
  w: number,
  h: number,
  pad: CornerPads,
): Record<CornerId, Spot> {
  const left = pad.left;
  const right = Math.max(pad.left, vw - w - pad.right);
  const top = pad.top;
  const bottom = Math.max(pad.top, vh - h - pad.bottom);
  return {
    tl: { x: left, y: top },
    tr: { x: right, y: top },
    bl: { x: left, y: bottom },
    br: { x: right, y: bottom },
  };
}

/** Nearest corner by box top-left distance (ties prefer top, then left). */
export function nearestCorner(x: number, y: number, spots: Record<CornerId, Spot>): CornerId {
  let best: CornerId = "br";
  let bestD = Infinity;
  for (const id of ["tl", "tr", "bl", "br"] as const) {
    const s = spots[id];
    const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
