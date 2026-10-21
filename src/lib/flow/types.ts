/**
 * Data for <FlowDiagram>: the "How it works" pattern shared by the home page and the case
 * studies. One list of nodes drives both layouts: a grid with SVG edges on wide containers,
 * and a vertical path of rows with a bottom sheet on narrow ones.
 */

export interface FlowDetails {
  /** "What it does". */
  does: string;
  /** "Tech": one item per line. `backticks` render as code. */
  tech: string[];
  /** "Key decision". */
  why: string;
}

export interface FlowNode {
  id: string;
  /** ≤ 28 characters (two lines at most; longer text belongs in the details). */
  title: string;
  /** Mono sub-line, ≤ 30 characters. */
  sub?: string;
  /** Grid placement in the wide layout: [row, column], 1-based. */
  at: [row: number, col: number];
  /** On the main path: accent border, accent rail dot in the list, the legend's key item. */
  key?: boolean;
  /** Id of a group in the `groups` prop: a dashed outline around its members (wide layout) and a
   * label above each run of members (list). Members should be adjacent in DOM order. */
  group?: string;
  details: FlowDetails;
}

/**
 * Edge styles from the flow spec: solid for calls (the default), dashed for deprecated paths
 * and dead ends, dotted for model calls.
 */
export type FlowEdgeStyle = "solid" | "dashed" | "dotted";

/** [from, to, style?]: a call or data flow from one node to another. */
export type FlowEdge = [from: string, to: string, style?: FlowEdgeStyle];

/** Authoring budgets from the flow spec. */
export const TITLE_MAX = 28;
export const SUB_MAX = 30;
export const GROUP_MAX = 24;

/** Problems in the data (unknown ids, duplicates, over-budget labels). Empty means OK. */
export function flowProblems(
  nodes: FlowNode[],
  edges: FlowEdge[],
  cols: number,
  groups: Record<string, string> = {},
): string[] {
  const out: string[] = [];
  for (const [g, label] of Object.entries(groups))
    if (label.length > GROUP_MAX) out.push(`group "${g}": label over ${GROUP_MAX} chars`);
  const ids = new Set<string>();
  const cells = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) out.push(`duplicate node "${n.id}"`);
    ids.add(n.id);
    const cell = n.at.join("/");
    if (cells.has(cell)) out.push(`two nodes in cell ${cell}`);
    cells.add(cell);
    if (n.at[1] < 1 || n.at[1] > cols) out.push(`node "${n.id}" is outside the ${cols} columns`);
    if (n.title.length > TITLE_MAX) out.push(`node "${n.id}": title over ${TITLE_MAX} chars`);
    if ((n.sub?.length ?? 0) > SUB_MAX) out.push(`node "${n.id}": sub-line over ${SUB_MAX} chars`);
    if (n.group && !(n.group in groups)) out.push(`node "${n.id}": no group "${n.group}"`);
  }
  for (const [a, b] of edges)
    for (const id of [a, b]) if (!ids.has(id)) out.push(`edge ${a}→${b}: no node "${id}"`);
  return out;
}

/** Inline `code` in detail strings, HTML-escaped. */
export function richText(s: string): string {
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return s
    .split("`")
    .map((part, i) => (i % 2 ? `<code>${esc(part)}</code>` : esc(part)))
    .join("");
}
