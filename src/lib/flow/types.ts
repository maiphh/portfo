/**
 * Data for <FlowDiagram>: the "How it works" pattern shared by the home page and the case
 * studies. One list of nodes drives both layouts: a grid with SVG edges on wide containers
 * (`at`), and a hand-authored vertical lane layout on phones and tablets (`mAt`, `mAt2`), also
 * with SVG edges, where a tap opens the bottom sheet.
 *
 * Lanes: a phone layout has 1–3 lanes (columns). Three lanes need a container of at least
 * LANES3_MIN px (a 480px viewport, so phones get 2 lanes) or the diagram's `lanes3Min`; below that the diagram switches
 * to its 2-lane layout. A layout that uses 3 lanes must therefore give every node an explicit
 * `mAt2` (lanes 1–2). There is no automatic remap: hubs and branches only read when placed by
 * hand. A layout with at most 2 lanes uses `mAt` everywhere and has no `mAt2`.
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
  /** Phone/tablet placement: [row, lane], 1-based, lanes 1–3. Required (flowProblems). */
  mAt?: [row: number, lane: number];
  /** 2-lane placement used below the 3-lane width; required when any `mAt` uses lane 3. */
  mAt2?: [row: number, lane: number];
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

/** Most lanes in a phone layout, and in the fallback layout below the 3-lane width. */
export const MAX_LANES = 3;
export const MAX_LANES2 = 2;

/** Lanes used by `mAt` and by the layout used below the 3-lane width (`mAt2`, or `mAt`). */
export function laneCounts(nodes: FlowNode[]): { lanes: number; lanes2: number } {
  const lanes = Math.max(1, ...nodes.map((n) => n.mAt?.[1] ?? 1));
  const lanes2 = lanes > MAX_LANES2 ? Math.max(1, ...nodes.map((n) => n.mAt2?.[1] ?? 1)) : lanes;
  return { lanes, lanes2 };
}

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
  out.push(...phoneProblems(nodes, groups));
  return out;
}

/** The phone layouts: every node placed, lanes in range, no shared cells, groups unbroken. */
function phoneProblems(nodes: FlowNode[], groups: Record<string, string>): string[] {
  const out: string[] = [];
  const missing = nodes.filter((n) => !n.mAt);
  for (const n of missing) out.push(`node "${n.id}": no phone placement (mAt)`);
  if (missing.length) return out;
  const three = nodes.some((n) => (n.mAt?.[1] ?? 0) > MAX_LANES2);
  const layouts: [string, (n: FlowNode) => [number, number] | undefined, number][] = [
    ["mAt", (n) => n.mAt, MAX_LANES],
  ];
  if (three) layouts.push(["mAt2", (n) => n.mAt2, MAX_LANES2]);
  else
    for (const n of nodes)
      if (n.mAt2) out.push(`node "${n.id}": mAt2 is only for layouts that use 3 lanes`);
  for (const [key, pos, max] of layouts) {
    const cells = new Map<string, string>();
    for (const n of nodes) {
      const p = pos(n);
      if (!p) {
        out.push(`node "${n.id}": no 2-lane placement (mAt2), and mAt uses 3 lanes`);
        continue;
      }
      const [row, lane] = p;
      if (!Number.isInteger(row) || row < 1 || !Number.isInteger(lane) || lane < 1 || lane > max)
        out.push(`node "${n.id}": ${key} ${row}/${lane} is outside rows ≥ 1 and lanes 1–${max}`);
      const cell = `${row}/${lane}`;
      const other = cells.get(cell);
      if (other) out.push(`${key}: "${other}" and "${n.id}" share phone cell ${cell}`);
      else cells.set(cell, n.id);
    }
    // A group's box is drawn around its members; nothing else may sit inside it.
    for (const g of Object.keys(groups)) {
      const mem = nodes.filter((n) => n.group === g).map((n) => pos(n));
      if (!mem.length || mem.some((p) => !p)) continue;
      const ps = mem as [number, number][];
      const [r0, r1] = [Math.min(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[0]))];
      const [l0, l1] = [Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[1]))];
      for (const n of nodes) {
        const p = pos(n);
        if (!p || n.group === g) continue;
        if (p[0] >= r0 && p[0] <= r1 && p[1] >= l0 && p[1] <= l1)
          out.push(`${key}: "${n.id}" sits inside group "${g}"`);
      }
    }
  }
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
