/** Small pure helpers for the panel layout, kept out of the DOM code so they are testable. */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const overlaps = (a: Box, b: Box, pad = 0) =>
  a.left < b.right + pad &&
  a.right + pad > b.left &&
  a.top < b.bottom + pad &&
  a.bottom + pad > b.top;

/**
 * Pixels the on-screen keyboard (or any browser chrome) covers at the bottom of the layout
 * viewport, from window.visualViewport. The sheet lifts by this much so the input stays visible.
 */
export function keyboardInset(
  layoutHeight: number,
  vv: { height: number; offsetTop: number } | null | undefined,
): number {
  if (!vv) return 0;
  const inset = layoutHeight - (vv.height + vv.offsetTop);
  return inset > 1 ? Math.round(inset) : 0;
}
