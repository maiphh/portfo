/**
 * The site's published content, generated from the Astro repo by `pnpm corpus`
 * (scripts/corpus.ts) and bundled into the Worker. The chat tools read it.
 */
import raw from "../data/site.json";

export interface ProjectData {
  slug: string;
  title: string;
  headline: string;
  oneLiner: string;
  org: string;
  /** Phu's job title at `org` when it is on the CV, else null. */
  role: string | null;
  period: string | null;
  tags: string[];
  order: number;
  /** Case-study page, e.g. "/work/legal-rag". */
  href: string;
  /** Section on the home page, e.g. "/#work-rag". */
  homeHref: string;
  /** Employer work: CV-level facts only. */
  confidential: boolean;
  approach: { title: string; body: string }[];
  outcomes: { value: string; label: string }[];
  note: string | null;
  links: { label: string; href: string }[];
  /** The case-study body in Markdown. */
  body: string;
}

export interface ExperienceData {
  id: string;
  kind: "work" | "study" | "award";
  title: string;
  detail: string;
  start: string;
  end: string | null;
  highlight: string | null;
}

export interface SiteData {
  profile: { name: string; role: string; city: string; summary: string };
  contact: {
    email: string;
    github: string;
    githubHandle: string;
    contactHref: string;
    howToReach: string;
  };
  experience: ExperienceData[];
  projects: ProjectData[];
}

export const siteData = raw as SiteData;
