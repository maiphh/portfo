/**
 * Ecom flow select effect (loaded by scripts/case/page.ts only without reduced motion): the lit
 * edges redraw from the chosen node outward.
 */
import { onFlowSelect, redraw } from "./effects";

export default function ecom(root: HTMLElement) {
  onFlowSelect(root, ({ id, edges }) => redraw(edges, id));
}
