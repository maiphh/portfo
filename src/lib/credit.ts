/**
 * The isoglow credit under case-study pages (HIGHLIGHTS-SPEC §3; review 2026-10-27: exactly this
 * line, "isoglow" linking isoglow.dev, case-study pages only). One constant so the wording can be
 * swapped in one place.
 * The MIT licence itself ships with the code: src/lib/iso/LICENSE-iso-glow.
 */
export const ISO_CREDIT = {
  text: "Diagrams drawn with isoglow (MIT)",
  link: { href: "https://isoglow.dev", label: "isoglow" },
} as const;
/** A footer credit line; `link.label` is linked where it appears in `text` (else appended). */
export type Credit = { text: string; link?: { href: string; label: string } };
