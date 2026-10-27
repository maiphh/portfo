/**
 * OpenPortfo flow select effect (loaded by scripts/case/page.ts only without reduced motion): a
 * quote travels each lit edge once; the model edge stays dotted.
 */
import { onFlowSelect, packet } from "./effects";

export default function op(root: HTMLElement) {
  onFlowSelect(root, ({ id, edges }, svg) =>
    edges
      .filter((p) => !p.classList.contains("dotted"))
      .forEach((p, i) => setTimeout(() => packet(svg, p, p.dataset.a !== id, 650), i * 70)),
  );
}
