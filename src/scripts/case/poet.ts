/**
 * POET flow select effect (loaded by scripts/case/page.ts only without reduced motion): a sun dot
 * travels each lit edge once (the dead-end edge stays dashed).
 */
import { onFlowSelect, packet } from "./effects";

export default function poet(root: HTMLElement) {
  onFlowSelect(root, ({ id, edges }, svg) =>
    edges
      .filter((p) => !p.classList.contains("dashed"))
      .forEach((p, i) => setTimeout(() => packet(svg, p, p.dataset.a !== id, 650), i * 70)),
  );
}
