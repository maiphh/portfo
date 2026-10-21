/**
 * Work entries that use the shared case-study template (components/case/CaseStudy.astro).
 * Entries not listed here still render with the older single-column page.
 */
import DocumentOcr from "./document-ocr/Page.astro";

export const caseStudies = {
  "document-ocr": DocumentOcr,
} as const;

export type CaseStudySlug = keyof typeof caseStudies;
export const isCaseStudy = (slug: string): slug is CaseStudySlug => slug in caseStudies;
