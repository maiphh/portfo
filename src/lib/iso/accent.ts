/**
 * Plate colours per page accent (HIGHLIGHTS-SPEC §1: hi / dim / glass / tint / err), keyed by the
 * work entry's accent line. The error red moves to pink on the orange pages so it reads apart.
 */
const EXTRA: Record<string, { hi: string; dim: string; glass: string; err: string }> = {
  "#ff8f33": { hi: "#ffd2a8", dim: "#8a4a14", glass: "#2a1a0c", err: "#ff6f91" },
  "#4fd8c4": { hi: "#c4f5ec", dim: "#1f6b60", glass: "#0f2523", err: "#ff9d8a" },
  "#8cc8ff": { hi: "#d6ebff", dim: "#2f5f8c", glass: "#12202c", err: "#ff9d8a" },
  "#f6c43f": { hi: "#fde9a8", dim: "#7a611c", glass: "#29220c", err: "#ff9d8a" },
};
const LIME = { hi: "#e3fb94", dim: "#6f8a2a", glass: "#1d2210", err: "#ff9d8a" };

/** CSS custom properties for the plates, to append to the article's style. */
export const plateVars = (line: string) => {
  const x = EXTRA[line.toLowerCase()] ?? LIME;
  return `--acc-hi:${x.hi};--acc-dim:${x.dim};--acc-glass:${x.glass};--acc-err:${x.err}`;
};

/** The iso-glow filters (prototype build.mjs IGF), emitted once per page that has plates. */
export const IGF = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><filter id="ig-glow" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="ig-soft" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="ig-bloom" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><feGaussianBlur stdDeviation="9"/></filter></defs></svg>`;
