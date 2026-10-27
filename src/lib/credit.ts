/**
 * The isoglow credit under case-study pages (HIGHLIGHTS-SPEC §3, Phu 2026-10-26: short, linking
 * isoglow.dev, case-study pages only). One constant so the wording can be swapped in one place.
 * The MIT licence itself ships with the code: src/lib/iso/LICENSE-iso-glow.
 */
export const ISO_CREDIT = {
  text: "Highlights figures drawn with the iso-glow kernel (MIT)",
  link: { href: "https://isoglow.dev/", label: "isoglow.dev" },
} as const;
export type Credit = { text: string; link?: { href: string; label: string } };
