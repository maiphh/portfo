/**
 * Work entries that use the shared case-study template (components/case/CaseStudy.astro).
 * Entries not listed here still render with the older single-column page.
 */
import DataValidation from "./data-validation/Page.astro";
import DocumentOcr from "./document-ocr/Page.astro";
import LegalRag from "./legal-rag/Page.astro";

export const caseStudies = {
  "document-ocr": DocumentOcr,
  "legal-rag": LegalRag,
  "data-validation": DataValidation,
} as const;

export type CaseStudySlug = keyof typeof caseStudies;
export const isCaseStudy = (slug: string): slug is CaseStudySlug => slug in caseStudies;
