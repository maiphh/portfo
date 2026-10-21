/**
 * Small effects the case-study motion modules share (loaded only without reduced motion).
 */
const NS = "http://www.w3.org/2000/svg";

export interface SelectDetail {
  id: string;
  node: HTMLElement;
  edges: SVGPathElement[];
}

/** Run `fn` each time a node of the page's FlowDiagram is selected. */
export function onFlowSelect(
  root: HTMLElement,
  fn: (d: SelectDetail, svg: SVGSVGElement) => void,
): void {
  const block = root.querySelector<HTMLElement>("[data-flow-block]");
  const svg = block?.querySelector<SVGSVGElement>("[data-flow-edges]");
  if (!block || !svg) return;
  block.addEventListener("flow:select", (e) => fn((e as CustomEvent<SelectDetail>).detail, svg));
}

/** One dot along `path` (from its start, or from its end when `reverse`). */
export function packet(svg: SVGSVGElement, path: SVGPathElement, reverse: boolean, ms = 600) {
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("r", "4");
  dot.setAttribute("class", "pk");
  svg.append(dot);
  const len = path.getTotalLength();
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const p = path.getPointAtLength(len * (reverse ? 1 - e : e));
    dot.setAttribute("cx", String(p.x));
    dot.setAttribute("cy", String(p.y));
    if (k < 1) requestAnimationFrame(step);
    else dot.remove();
  };
  requestAnimationFrame(step);
}

/** Redraw lit edges from the selected node outward (a stroke draw-in). */
export function redraw(edges: SVGPathElement[], from: string) {
  edges.forEach((p, i) => {
    const len = p.getTotalLength();
    const out = p.dataset.a === from;
    p.animate(
      [
        { strokeDasharray: `${len}`, strokeDashoffset: `${out ? len : -len}` },
        { strokeDasharray: `${len}`, strokeDashoffset: "0" },
      ],
      { duration: 650, delay: i * 50, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" },
    );
  });
}
