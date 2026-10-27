/**
 * Legal RAG flow select effect (loaded by scripts/case/page.ts only without reduced motion): the
 * lit edges redraw from the chosen node outward. An edge on this page is a citation path, so no
 * packets.
 */
import { onFlowSelect, redraw } from "./effects";

export default function rag(root: HTMLElement) {
  onFlowSelect(root, ({ id, edges }) => redraw(edges, id));
}
