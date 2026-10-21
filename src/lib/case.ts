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
  /** Text description of what plays (the clip has no speech, so no captions track). */
  description: string;
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
  /** Key into scripts/case/motion.ts: the page's one authored moment and its flow select effect. */
  motion?: string;
  /** Caption under the opener's signature object. */
  signatureCaption: string;
  overview: CaseOverview;
  highlight: { title: string; caption: string };
  video?: CaseVideo;
  how: { summary: string; stack: CaseStackItem[]; flow: CaseFlow };
  dives: CaseDive[];
  limits: CaseLimits;
}
