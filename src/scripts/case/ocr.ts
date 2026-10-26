/**
 * Document OCR flow select effect (loaded by scripts/case/page.ts only without reduced motion):
 * a one-pass scan line crosses the chosen node and a packet runs each connected edge once.
 */
import { packet } from "./effects";

function flowSelect(root: HTMLElement) {
  for (const block of root.querySelectorAll<HTMLElement>("[data-flow-block]")) {
    const svg = block.querySelector<SVGSVGElement>("[data-flow-edges]");
    if (!svg) continue;
    block.addEventListener("flow:select", (e) => {
      const { id, node, edges } = (
        e as CustomEvent<{ id: string; node: HTMLElement; edges: SVGPathElement[] }>
      ).detail;
      const line = document.createElement("i");
      line.className = "flow-scan";
      line.setAttribute("aria-hidden", "true");
      node.append(line);
      line
        .animate(
          [
            { transform: "translateY(0)", opacity: 1 },
            { transform: `translateY(${node.offsetHeight - 2}px)`, opacity: 0 },
          ],
          { duration: 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        )
        .finished.finally(() => line.remove());
      edges.forEach((p, i) => setTimeout(() => packet(svg, p, p.dataset.a !== id), i * 60));
    });
  }
}

export default function ocr(root: HTMLElement) {
  flowSelect(root);
}
