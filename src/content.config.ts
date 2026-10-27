import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

/** Case studies: one Markdown/MDX file per project, rendered at /work/[slug]. */
const work = defineCollection({
  loader: glob({ base: "./src/content/work", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    /** Short name, used in lists ("Document OCR pipeline"). */
    title: z.string(),
    /** Display headline on the home chapter and the case-study page. */
    headline: z.string(),
    /** One or two sentences, plain text. Used for meta descriptions and cards. */
    summary: z.string(),
    org: z.string(),
    /** Neutral org badge, first in the meta row of the hero and the home card
     * (e.g. "Enterprise · Talentnet"). Rendered as "<b>Enterprise</b> · Talentnet". */
    org_badge: z
      .string()
      .regex(/^[^·]+ · [^·]+$/, 'Use "Kind · Org"')
      .optional(),
    /** Project accent for the case-study page: the hero scan line and mark, the main path and
     * the selected flow node. Lime stays the site accent in the nav and the mascot. */
    accent: z
      .object({
        line: z.string().regex(/^#[0-9a-f]{6}$/i),
        tint: z.string().regex(/^#[0-9a-f]{6}$/i),
      })
      .optional(),
    /** Chips under the headline, e.g. ["Document OCR", "In production"]. Leave the org out when
     * `org_badge` says it. */
    meta: z.array(z.string()).default([]),
    period: z.string().optional(),
    /** Order on the home page (1 = first). */
    order: z.number().int().positive(),
    /** False for work shown only on the home page (no /work/<slug> case study). */
    page: z.boolean().default(true),
    /** Section id on the home page, e.g. "work-ocr". */
    anchor: z.string().regex(/^[a-z0-9-]+$/),
    /** How-it-works steps. `[[term]]` marks a Vietnamese legal term. */
    steps: z.array(z.object({ title: z.string(), body: z.string() })).default([]),
    /** Headline numbers. `value` is the rendered final text; `count` drives the count-up. */
    facts: z
      .array(
        z.object({
          value: z.string(),
          label: z.string(),
          count: z.number().optional(),
          decimals: z.number().int().min(0).max(2).optional(),
          prefix: z.string().optional(),
          suffix: z.string().optional(),
        }),
      )
      .default([]),
    /** Small print under the illustration (e.g. "made-up invoice"). */
    note: z.string().optional(),
    /** Work for an employer: CV-level facts only, no code links or internal screenshots. */
    confidential: z.boolean().default(false),
    links: z.array(z.object({ label: z.string(), href: z.url() })).default([]),
    /** Open content questions, listed on the page as "still to confirm". */
    todo: z.array(z.string()).default([]),
  }),
});

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

/** CV entries: jobs, degrees and awards, drawn on the timeline. */
const experience = defineCollection({
  loader: file("src/data/experience.json"),
  schema: z.object({
    id: z.string(),
    lane: z.enum(["work", "study", "award"]),
    title: z.string(),
    /** Secondary line on the bar ("Game Developer · Dec 2023 – Sep 2025"). */
    detail: z.string(),
    start: yearMonth,
    /** Omit for ongoing ("now"). Awards are single points. */
    end: yearMonth.optional(),
    /** Row inside the lane when bars overlap. */
    row: z.number().int().positive().default(1),
    /** Optional paragraph under the timeline: bold lead + text. */
    note: z.object({ lead: z.string(), text: z.string() }).optional(),
    order: z.number().int(),
  }),
});

export const collections = { work, experience };
