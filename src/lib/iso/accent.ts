/**
 * Highlights drawing colours per page accent (hi / dim / glass; the tint is the work entry's),
 * keyed by the work entry's accent line: orange for OCR, Legal RAG and DVP, teal for OpenPortfo,
 * sky for Ecom, sun for POET. Any other line falls back to lime.
 */
const EXTRA: Record<string, { hi: string; dim: string; glass: string }> = {
  "#ff8f33": { hi: "#ffd2a8", dim: "#8a4a14", glass: "#2a1a0c" },
  "#4fd8c4": { hi: "#c4f5ec", dim: "#1f6b60", glass: "#0f2523" },
  "#8cc8ff": { hi: "#d6ebff", dim: "#2f5f8c", glass: "#12202c" },
  "#f6c43f": { hi: "#fde9a8", dim: "#7a611c", glass: "#29220c" },
};
const LIME = { hi: "#e3fb94", dim: "#6f8a2a", glass: "#1d2210" };

/** CSS custom properties for the drawings, to append to the article's style. */
export const plateVars = (line: string) => {
  const x = EXTRA[line.toLowerCase()] ?? LIME;
  return `--acc-hi:${x.hi};--acc-dim:${x.dim};--acc-glass:${x.glass}`;
};
