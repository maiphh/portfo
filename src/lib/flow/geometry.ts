/** Layout maths for the flow diagram. Pure, so it is unit-tested; scripts/flow.ts uses it. */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** From the flow spec: nodes never shrink below 150px; the gap is 24px; padding 2 × 28px. */
export const NODE_MIN = 150;
export const COL_GAP = 24;
export const FLOW_PAD = 56;

/** The container width below which the flow becomes a vertical list. */
export const listBelow = (cols: number) => cols * NODE_MIN + (cols - 1) * COL_GAP + FLOW_PAD;

const cx = (b: Box) => (b.left + b.right) / 2;
const cy = (b: Box) => (b.top + b.bottom) / 2;
const r = (n: number) => Math.round(n * 10) / 10;

export interface EdgeGeom {
  d: string;
  /** Endpoints, on the boxes' borders, in the same coordinates as the boxes. */
  from: [number, number];
  to: [number, number];
}

/**
 * An edge between two node boxes. Same column: a vertical line between the facing edges.
 * Otherwise a horizontal S-curve from the right edge of the left box to the left edge of the
 * right box. `from`/`to` follow the arguments, whichever side they land on.
 */
export function edgeGeom(a: Box, b: Box): EdgeGeom {
  if (Math.abs(cx(a) - cx(b)) < 4) {
    const aAbove = cy(a) < cy(b);
    const from: [number, number] = [r(cx(a)), r(aAbove ? a.bottom : a.top)];
    const to: [number, number] = [r(cx(a)), r(aAbove ? b.top : b.bottom)];
    return { d: `M${from[0]} ${from[1]} V${to[1]}`, from, to };
  }
  const aLeft = cx(a) < cx(b);
  const from: [number, number] = [r(aLeft ? a.right : a.left), r(cy(a))];
  const to: [number, number] = [r(aLeft ? b.left : b.right), r(cy(b))];
  const m = r((from[0] + to[0]) / 2);
  return { d: `M${from[0]} ${from[1]} C${m} ${from[1]} ${m} ${to[1]} ${to[0]} ${to[1]}`, from, to };
}

/** True when the point lies on the box's border (within `tol` px). */
export function onBorder([x, y]: [number, number], b: Box, tol = 1.5): boolean {
  const inX = x >= b.left - tol && x <= b.right + tol;
  const inY = y >= b.top - tol && y <= b.bottom + tol;
  const nearV = Math.abs(x - b.left) <= tol || Math.abs(x - b.right) <= tol;
  const nearH = Math.abs(y - b.top) <= tol || Math.abs(y - b.bottom) <= tol;
  return (nearV && inY) || (nearH && inX);
}
