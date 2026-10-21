/**
 * Legal RAG motion (loaded by scripts/case/page.ts only without reduced motion):
 * - the authored moment, played once when the opener is in view (it sits at the top of the
 *   page, so there may be no scroll room for a scrub): the running head assembles one address
 *   part at a time (Số › Điều › Khoản), then the clause it points to peels off the page as a
 *   chunk with its prefix written on;
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
  const tl = gsap.timeline({ paused: true });
  steps.forEach((el, i) => tl.call(() => el.classList.add("lit"), undefined, i ? "+=0.38" : 0.2));
  ScrollTrigger.create({ trigger: sig, start: "top 85%", once: true, onEnter: () => tl.play() });
}

export default function rag(root: HTMLElement) {
  statute(root);
  onFlowSelect(root, ({ id, edges }) => redraw(edges, id));
}
