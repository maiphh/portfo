/**
 * OpenPortfo motion (loaded by scripts/case/page.ts only without reduced motion):
 * - the authored moment, played once when the opener is in view: the holdings are priced one
 *   at a time, then the refresh line appears (one batch, cached);
 * - the flow select effect: a quote travels each lit edge once; the model edge stays dotted.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { onFlowSelect, packet } from "./effects";

gsap.registerPlugin(ScrollTrigger);

function book(root: HTMLElement) {
  const sig = root.querySelector<HTMLElement>("[data-book]");
  const refresh = sig?.querySelector<HTMLElement>("[data-refresh]");
  if (!sig || !refresh) return;
  const rows = [...sig.querySelectorAll<HTMLElement>("[data-row]")];
  sig.classList.add("is-anim");
  const tl = gsap.timeline({ paused: true });
  [...rows, refresh].forEach((el, i) =>
    tl.call(() => el.classList.add("lit"), undefined, i ? "+=0.28" : 0.2),
  );
  ScrollTrigger.create({ trigger: sig, start: "top 85%", once: true, onEnter: () => tl.play() });
}

export default function op(root: HTMLElement) {
  book(root);
  onFlowSelect(root, ({ id, edges }, svg) =>
    edges
      .filter((p) => !p.classList.contains("dotted"))
      .forEach((p, i) => setTimeout(() => packet(svg, p, p.dataset.a !== id, 650), i * 70)),
  );
}
