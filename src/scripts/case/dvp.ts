/**
 * DVP flow select effect (loaded by scripts/case/page.ts only without reduced motion): a chip
 * travels each lit edge once and stops; model edges stay dotted.
 */
import { onFlowSelect, packet } from "./effects";

export default function dvp(root: HTMLElement) {
  onFlowSelect(root, ({ id, edges }, svg) =>
    edges
      .filter((p) => !p.classList.contains("dotted"))
      .forEach((p, i) => setTimeout(() => packet(svg, p, p.dataset.a !== id, 700), i * 70)),
  );
}
