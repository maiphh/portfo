/**
 * Case studies on the shared template (components/case/CaseStudy.astro). Every work entry with
 * a page must be listed here (pages/work/[slug].astro fails the build otherwise); entries with
 * `page: false` live only on the home page.
 */
import DataValidation from "./data-validation/Page.astro";
import DocumentOcr from "./document-ocr/Page.astro";
import Ecom from "./ecom/Page.astro";
import LegalRag from "./legal-rag/Page.astro";
import OpenPortfo from "./openportfo/Page.astro";
import Poet from "./poet/Page.astro";

export const caseStudies = {
  "document-ocr": DocumentOcr,
  "legal-rag": LegalRag,
  "data-validation": DataValidation,
  openportfo: OpenPortfo,
  ecom: Ecom,
  poet: Poet,
} as const;

export type CaseStudySlug = keyof typeof caseStudies;
export const isCaseStudy = (slug: string): slug is CaseStudySlug => slug in caseStudies;
