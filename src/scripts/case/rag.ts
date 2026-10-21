/**
 * Legal RAG motion (loaded by scripts/case/page.ts only without reduced motion):
 * - the authored moment: as the opener scrolls, the running head assembles one address part at
 *   a time (Số › Điều › Khoản) and the clause it points to peels off the page as a chunk, its
 *   prefix written on (scrubbed, reversible);
 * - the flow select effect: the lit edges redraw from the chosen node outward. An edge on this
 *   page is a citation path, so no packets.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { onFlowSelect, redraw } from "./effects";

gsap.registerPlugin(ScrollTrigger);

function statute(root: HTMLElement) {
  const sig = root.querySelector<HTMLElement>("[data-statute]");
  const chunk = sig?.querySelector<HTMLElement>("[data-chunk]");
  if (!sig || !chunk) return;
  const segs = [...sig.querySelectorAll<HTMLElement>("[data-seg]")];
  const steps = [...segs, chunk];
  sig.classList.add("is-anim");
  const at = (p: number) =>
    steps.forEach((el, i) => el.classList.toggle("lit", p >= (i + 1) / (steps.length + 1)));
  ScrollTrigger.create({
    trigger: sig,
    start: "top 80%",
    end: "bottom 40%",
    scrub: true,
    onUpdate: (st) => at(st.progress),
    onRefresh: (st) => at(st.progress),
  });
}

export default function rag(root: HTMLElement) {
  statute(root);
  onFlowSelect(root, ({ id, edges }) => redraw(edges, id));
}
