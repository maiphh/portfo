/**
 * Highlights drawing colours per page accent (HIGHLIGHTS-SPEC v3 §6), keyed by the work entry's
 * accent line: orange for OCR, Legal RAG and DVP, teal for OpenPortfo, sky for Ecom, sun for POET.
 * Any other line falls back to lime. The tint is the prototype's and goes in `--hl-tint`, so it does
 * not override the page's own `--acc-tint` (the work entry's, which differs for teal and sky).
 */
const EXTRA: Record<string, { hi: string; glass: string; tint: string }> = {
  "#ff8f33": { hi: "#ffd2a8", glass: "#2a1a0c", tint: "#33210f" },
  "#4fd8c4": { hi: "#c4f5ec", glass: "#0f2523", tint: "#10302c" },
  "#8cc8ff": { hi: "#d6ebff", glass: "#12202c", tint: "#132536" },
  "#f6c43f": { hi: "#fde9a8", glass: "#29220c", tint: "#33290f" },
};
const LIME = { hi: "#e3fb94", glass: "#1d2210", tint: "#2a3312" };

/** CSS custom properties for the drawings, to append to the article's style. */
export const plateVars = (line: string) => {
  const x = EXTRA[line.toLowerCase()] ?? LIME;
  return `--acc-hi:${x.hi};--acc-glass:${x.glass};--hl-tint:${x.tint}`;
};
