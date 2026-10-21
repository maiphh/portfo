/**
 * Ecom motion (loaded by scripts/case/page.ts only without reduced motion):
 * - the authored moment, played once when the opener is in view: the storefronts attach to the
 *   engine one at a time, then the boundary rule lights on the core. The core never moves;
 * - the flow select effect: the lit edges redraw from the chosen node outward.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { onFlowSelect, redraw } from "./effects";

gsap.registerPlugin(ScrollTrigger);

function engine(root: HTMLElement) {
  const sig = root.querySelector<HTMLElement>("[data-engine]");
  const core = sig?.querySelector<HTMLElement>("[data-core]");
  if (!sig || !core) return;
  const skins = [...sig.querySelectorAll<HTMLElement>("[data-skin]")];
  sig.classList.add("is-anim");
  const tl = gsap.timeline({ paused: true });
  [...skins, core].forEach((el, i) =>
    tl.call(() => el.classList.add("lit"), undefined, i ? "+=0.45" : 0.25),
  );
  ScrollTrigger.create({ trigger: sig, start: "top 85%", once: true, onEnter: () => tl.play() });
}

export default function ecom(root: HTMLElement) {
  engine(root);
  onFlowSelect(root, ({ id, edges }) => redraw(edges, id));
}
