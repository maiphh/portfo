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

/**
 * The flow's width (padding included) at a 480px viewport: from here a lane layout may use 3
 * lanes. Phones (320–430px) get 2 lanes, where titles and two-line sub-lines fit without being
 * cut; 3 lanes at 390–430 left lanes ~100px wide and clamped sub-lines.
 */
export const LANES3_MIN = 438;

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
  // Off-level edges leave and enter a little towards each other, so edges fanning into one
  // side (the Worker's left: the browser level with it, the Cron Trigger below) keep apart.
  const dy = Math.abs(cy(a) - cy(b)) < 4 ? 0 : Math.sign(cy(b) - cy(a));
  const sy = (x: Box) => Math.min((x.bottom - x.top) / 4, PORT_Y);
  const from: [number, number] = [r(aLeft ? a.right : a.left), r(cy(a) + dy * sy(a))];
  const to: [number, number] = [r(aLeft ? b.left : b.right), r(cy(b) - dy * sy(b))];
  const m = r((from[0] + to[0]) / 2);
  return { d: `M${from[0]} ${from[1]} C${m} ${from[1]} ${m} ${to[1]} ${to[0]} ${to[1]}`, from, to };
}

/** Largest offset of a grid edge's port from the middle of a box's left or right side. */
export const PORT_Y = 12;

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
  if (Math.abs(cx(a) - cx(b)) < 4) {
    const from: [number, number] = [r(cx(a)), r(aAbove ? a.bottom : a.top)];
    return {
      d: `M${from[0]} ${from[1]} V${r(aAbove ? b.top : b.bottom)}`,
      from,
      to: [from[0], r(aAbove ? b.top : b.bottom)],
    };
  }
  // A diagonal leaves and enters off-centre, towards the other box, so it gets its own port
  // and doesn't merge with a straight edge into the same side.
  const from: [number, number] = [r(cx(a) + port(a, b)), r(aAbove ? a.bottom : a.top)];
  const to: [number, number] = [r(cx(b) + port(b, a)), r(aAbove ? b.top : b.bottom)];
  const m = r((from[1] + to[1]) / 2);
  return { d: `M${from[0]} ${from[1]} C${from[0]} ${m} ${to[0]} ${m} ${to[0]} ${to[1]}`, from, to };
}

/** Offset of a diagonal's port along a box's top or bottom: a quarter of the way to the side
 * facing the other box, at most PORT px. */
export const PORT = 20;
const port = (self: Box, other: Box) =>
  Math.sign(cx(other) - cx(self)) * Math.min((self.right - self.left) / 4, PORT);

/**
 * An edge routed along a horizontal gutter at `via` (a y between rows, chosen by the caller
 * when the direct edge would cross a node): out of the box's top or bottom (whichever faces
 * `via`), along `via` with rounded corners, into the target's top or bottom.
 */
export function edgeGeomY(a: Box, b: Box, via: number): EdgeGeom {
  const ya = via < cy(a) ? a.top : a.bottom;
  const yb = via < cy(b) ? b.top : b.bottom;
  const dx = Math.sign(cx(b) - cx(a));
  const xa = cx(a) + dx * Math.min((a.right - a.left) / 4, PORT);
  const xb = cx(b) - dx * Math.min((b.right - b.left) / 4, PORT);
  const from: [number, number] = [r(xa), r(ya)];
  const to: [number, number] = [r(xb), r(yb)];
  const sa = Math.sign(via - ya) || 1;
  const sb = Math.sign(yb - via) || 1;
  const k = Math.min(6, Math.abs(via - ya), Math.abs(via - yb), Math.abs(xb - xa) / 2);
  const v = r(via);
  const d =
    `M${from[0]} ${from[1]} V${r(via - sa * k)} Q${from[0]} ${v} ${r(xa + dx * k)} ${v} ` +
    `H${r(xb - dx * k)} Q${to[0]} ${v} ${to[0]} ${r(via + sb * k)} V${to[1]}`;
  return { d, from, to };
}

/**
 * Points every `step` px or so along a path made by the functions above (M, H, V, Q and C
 * commands, absolute). Pure, so crossing checks run without the DOM.
 */
export function pathPoints(d: string, step = 3): [number, number][] {
  const out: [number, number][] = [];
  const tokens = d.match(/[MHVQC]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let x = 0;
  let y = 0;
  const num = () => Number(tokens[i++]);
  const line = (x1: number, y1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x, y1 - y) / step));
    for (let k = 1; k <= n; k++) out.push([x + ((x1 - x) * k) / n, y + ((y1 - y) * k) / n]);
    [x, y] = [x1, y1];
  };
  /** A quadratic (q2 = null) or cubic Bézier from the current point to `p`. */
  const curve = (q1: [number, number], q2: [number, number] | null, p: [number, number]) => {
    const [x0, y0] = [x, y];
    const est = Math.hypot(q1[0] - x0, q1[1] - y0) + Math.hypot(p[0] - q1[0], p[1] - q1[1]);
    const n = Math.max(2, Math.ceil(est / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      if (q2)
        out.push([
          u * u * u * x0 + 3 * u * u * t * q1[0] + 3 * u * t * t * q2[0] + t * t * t * p[0],
          u * u * u * y0 + 3 * u * u * t * q1[1] + 3 * u * t * t * q2[1] + t * t * t * p[1],
        ]);
      else
        out.push([
          u * u * x0 + 2 * u * t * q1[0] + t * t * p[0],
          u * u * y0 + 2 * u * t * q1[1] + t * t * p[1],
        ]);
    }
    [x, y] = p;
  };
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === "M") {
      x = num();
      y = num();
      out.push([x, y]);
    } else if (c === "H") line(num(), y);
    else if (c === "V") line(x, num());
    else if (c === "Q") {
      const q1: [number, number] = [num(), num()];
      curve(q1, null, [num(), num()]);
    } else if (c === "C") {
      const q1: [number, number] = [num(), num()];
      const q2: [number, number] = [num(), num()];
      curve(q1, q2, [num(), num()]);
    }
  }
  return out;
}

/** Boxes (of `boxes`) that the path passes through: further than `pad` px inside them. */
export function crossedBoxes(d: string, boxes: Box[], pad = 2): number[] {
  const pts = pathPoints(d);
  const hit: number[] = [];
  boxes.forEach((b, k) => {
    if (
      pts.some(
        ([x, y]) => x > b.left + pad && x < b.right - pad && y > b.top + pad && y < b.bottom - pad,
      )
    )
      hit.push(k);
  });
  return hit;
}

/** True when the point lies on the box's border (within `tol` px). */
export function onBorder([x, y]: [number, number], b: Box, tol = 1.5): boolean {
  const inX = x >= b.left - tol && x <= b.right + tol;
  const inY = y >= b.top - tol && y <= b.bottom + tol;
  const nearV = Math.abs(x - b.left) <= tol || Math.abs(x - b.right) <= tol;
  const nearH = Math.abs(y - b.top) <= tol || Math.abs(y - b.bottom) <= tol;
  return (nearV && inY) || (nearH && inX);
}
