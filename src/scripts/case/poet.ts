/**
 * POET motion (loaded by scripts/case/page.ts only without reduced motion):
 * - the authored moment, played once when the opener is in view: the gift moves down the money
 *   path one step at a time and the signed-webhook step lights when it's reached;
 * - the flow select effect: a sun dot travels each lit edge once (the dead-end edge stays dashed).
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { onFlowSelect, packet } from "./effects";

gsap.registerPlugin(ScrollTrigger);

function money(root: HTMLElement) {
  const sig = root.querySelector<HTMLElement>("[data-money]");
  if (!sig) return;
  const steps = [...sig.querySelectorAll<HTMLElement>("[data-step]")];
  sig.classList.add("is-anim");
  const tl = gsap.timeline({ paused: true });
  steps.forEach((el, i) => tl.call(() => el.classList.add("lit"), undefined, i ? "+=0.3" : 0.2));
  ScrollTrigger.create({ trigger: sig, start: "top 85%", once: true, onEnter: () => tl.play() });
}

export default function poet(root: HTMLElement) {
  money(root);
  onFlowSelect(root, ({ id, edges }, svg) =>
    edges
      .filter((p) => !p.classList.contains("dashed"))
      .forEach((p, i) => setTimeout(() => packet(svg, p, p.dataset.a !== id, 650), i * 70)),
  );
}
