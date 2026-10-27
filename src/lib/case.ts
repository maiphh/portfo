/**
 * Data contract for the shared case-study template (components/case/CaseStudy.astro).
 * Section order and rules: portfo-design case-studies/moodboards/case-study-skeleton.md.
 * Strings may use `backticks` for code (rendered by richText).
 */
import type { FlowEdge, FlowNode } from "~/lib/flow/types";

export interface CaseOverview {
  problem: string;
  solution: string;
  /** Only results the project pack states. Omit when the pack's result is unconfirmed: the
   * column then shows only in the ?dev view, as a TODO slot. */
  outcome?: string;
  /** What is still missing for the outcome (shown in ?dev only). */
  outcomeTodo?: string;
}

export interface CaseStackItem {
  label: string;
  value: string;
  version?: string;
}

export interface CaseFlow {
  cols: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups?: Record<string, string>;
  /** Legend text for key nodes, e.g. "on the path a page takes". */
  keyLabel: string;
  /** Accessible name of the node list. */
  label: string;
  /** Flow width from which the 3-lane phone layout is used (FlowDiagram `lanes3Min`). */
  lanes3Min?: number;
}

export interface CaseDive {
  /** Also the name of the slot that holds the artifact: `dive-<id>`. */
  id: string;
  /** A claim, not a topic. */
  title: string;
  paragraphs: string[];
  /** The one-line "what this shows". */
  shows: string;
  /** Caption under the artifact, naming where its pixels come from. */
  caption: string;
  /** Highlights flow copy (HIGHLIGHTS-SPEC v2 §2.1). Absent = the dive keeps its `dive-<id>` slot
   *  artifact. The drawing is in `src/case-studies/<slug>/scenes.ts`, keyed by the dive id. */
  flow?: DiveFlowCopy;
}

/** The step list beside a Highlights drawing: one numbered marker in the drawing per step. */
export interface DiveFlowCopy {
  /** One short sentence per step (markdown: `code` allowed), in order. */
  steps: string[];
  /** Optional chip row under one step: [1-based step, items, aria-label, show the label]. */
  chips?: [step: number, items: string[], label: string, showLabel?: boolean];
}

export interface CaseStackTable {
  title: string;
  rows: [piece: string, choice: string][];
}

export interface CaseLimits {
  /** Paths that still run but aren't the main one. */
  deprecated: string[];
  /** For developers: where the project's docs lag its code (collapsed). */
  docsLag: string[];
  /** Reserved or unimplemented features the page must not claim. */
  reserved: string[];
  /** What stays private. */
  notShown: string[];
  /** The full stack with versions (collapsed, opened by "Full stack with versions"). */
  stack: CaseStackTable[];
  /** Where the versions come from. */
  stackSource: string;
}

/** The project's promo cut. Renders only when the slug is in flags.CASE_VIDEOS (approved). */
export interface CaseVideo {
  /** A web encode in public/ (H.264, faststart, no audio track). */
  src: string;
  poster: string;
  caption: string;
  /** Text description of what plays (the clip has no speech, so no captions track). Omit to show the caption only. */
  description?: string;
}

/** An extra section after the deep dives (e.g. the first shop built on a template). Its body is
 * the `extra` slot. */
export interface CaseExtra {
  id: string;
  /** Short label for the depth rail. */
  rail: string;
  title: string;
  paragraphs: string[];
  caption?: string;
}

export interface CaseStudyData {
  /** Credit line under the opener's lede, e.g. for a UI cloned from an open-source project:
   * `lead`, then a link to the source, then `rest`. */
  credit?: { lead: string; label: string; href: string; rest?: string };
  extra?: CaseExtra;
  /** Key into the motion registry in scripts/case/page.ts: the page's flow select effect. */
  motion?: string;
  /** Hero A (components/case/CaseHeroTitle.astro): the short display name set huge as the h1.
   * Falls back to the entry title. */
  hero_name?: string;
  /** Exact substring of the entry's headline that gets the accent mark. No mark if absent or not
   * found. */
  hero_mark?: string;
  /** Short label riding the scan line in the intro (decorative, aria-hidden). No tag if absent. */
  hero_tag?: string;
  /** Em width of the widest word of `hero_name` in Hubot Sans 820 / wdth 118 / −0.055em,
   * measured in Chrome (the word at 100px in a hidden span, width ÷ 100), so the name fills the
   * column without JS. Re-measure if the name changes. Fallback: 0.7 × the longest word's letters. */
  hero_w?: number;
  overview: CaseOverview;
  highlight: { title: string; caption: string };
  video?: CaseVideo;
  how: {
    summary: string;
    /** Shown beside the summary. An empty list hides the stack and the versions link. */
    stack: CaseStackItem[];
    /** A second diagram, rendered above the architecture diagram. Same component, its own nodes. */
    application?: { title: string; flow: CaseFlow };
    /** Heading for the architecture diagram, so the two subsections are named. */
    architectureTitle?: string;
    /** Sentence under that heading. */
    architectureNote?: string;
    /** Idle tour on every diagram in this section. Pauses while a part is hovered, focused, or open. */
    autoplay?: boolean;
    flow: CaseFlow;
  };
  dives: CaseDive[];
  limits: CaseLimits;
}
