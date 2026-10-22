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

/** The flow's width (padding included) at a 390px phone: from here a phone layout may use 3 lanes. */
export const LANES3_MIN = 348;

/** The container width below which the flow switches to its phone/tablet lane layout. */
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

/**
 * An edge in the phone/tablet lane layout (nodes stacked in rows, 1–3 lanes).
 * - Same row (the boxes overlap vertically): a horizontal curve between the facing sides.
 * - Same lane: a vertical line between the facing edges.
 * - Otherwise: a vertical S-curve from the bottom of the upper box to the top of the lower one
 *   (or top to bottom when the edge points up).
 * - With `via` (an x in a gutter or the outer margin, chosen by the caller when the edge would
 *   cross a node in a row it skips): out of the side facing `via`, along `via` with rounded
 *   corners, into the side of the target facing `via`.
 * `from`/`to` follow the arguments and always lie on the boxes' borders.
 */
export function edgeGeomV(a: Box, b: Box, via?: number): EdgeGeom {
  if (via !== undefined) {
    const sa = via >= cx(a) ? a.right : a.left;
    const sb = via >= cx(b) ? b.right : b.left;
    const ya = cy(a);
    const yb = cy(b);
    const from: [number, number] = [r(sa), r(ya)];
    const to: [number, number] = [r(sb), r(yb)];
    const dy = Math.sign(yb - ya) || 1;
    const k = Math.min(6, Math.abs(via - sa), Math.abs(via - sb), Math.abs(yb - ya) / 2);
    const da = Math.sign(via - sa);
    const db = Math.sign(sb - via);
    const v = r(via);
    const d =
      `M${from[0]} ${from[1]} H${r(via - da * k)} Q${v} ${from[1]} ${v} ${r(ya + dy * k)} ` +
      `V${r(yb - dy * k)} Q${v} ${to[1]} ${r(via + db * k)} ${to[1]} H${to[0]}`;
    return { d, from, to };
  }
  if (a.top < b.bottom && b.top < a.bottom) {
    const aLeft = cx(a) < cx(b);
    const from: [number, number] = [r(aLeft ? a.right : a.left), r(cy(a))];
    const to: [number, number] = [r(aLeft ? b.left : b.right), r(cy(b))];
    if (Math.abs(from[1] - to[1]) < 1)
      return { d: `M${from[0]} ${from[1]} H${to[0]}`, from, to: [to[0], from[1]] };
    const m = r((from[0] + to[0]) / 2);
    return {
      d: `M${from[0]} ${from[1]} C${m} ${from[1]} ${m} ${to[1]} ${to[0]} ${to[1]}`,
      from,
      to,
    };
  }
  const aAbove = cy(a) < cy(b);
  const from: [number, number] = [r(cx(a)), r(aAbove ? a.bottom : a.top)];
  const to: [number, number] = [r(cx(b)), r(aAbove ? b.top : b.bottom)];
  if (Math.abs(cx(a) - cx(b)) < 4)
    return { d: `M${from[0]} ${from[1]} V${to[1]}`, from, to: [from[0], to[1]] };
  const m = r((from[1] + to[1]) / 2);
  return { d: `M${from[0]} ${from[1]} C${from[0]} ${m} ${to[0]} ${m} ${to[0]} ${to[1]}`, from, to };
}

/** True when the point lies on the box's border (within `tol` px). */
export function onBorder([x, y]: [number, number], b: Box, tol = 1.5): boolean {
  const inX = x >= b.left - tol && x <= b.right + tol;
  const inY = y >= b.top - tol && y <= b.bottom + tol;
  const nearV = Math.abs(x - b.left) <= tol || Math.abs(x - b.right) <= tol;
  const nearH = Math.abs(y - b.top) <= tol || Math.abs(y - b.bottom) <= tol;
  return (nearV && inY) || (nearH && inX);
}
