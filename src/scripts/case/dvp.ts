/**
 * DVP motion (loaded by scripts/case/page.ts only without reduced motion):
 * - the authored moment, played once when the opener is in view: the function name scrambles in
 *   from the plain rule, then the rows are checked one at a time and the one mismatch gets a
 *   coral outline (no shake). The opener sits at the top of the page, so it plays rather than
 *   scrubs (there may be no scroll room to finish a scrub);
 * - the flow select effect: a chip travels each lit edge once and stops; model edges stay dotted.
 */
import { gsap } from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { onFlowSelect, packet } from "./effects";

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);

function compiler(root: HTMLElement) {
  const sig = root.querySelector<HTMLElement>("[data-compiler]");
  const name = sig?.querySelector<HTMLElement>("[data-sig]");
  if (!sig || !name) return;
  const rows = [...sig.querySelectorAll<HTMLElement>("[data-row]")];
  sig.classList.add("is-anim");
  const text = name.textContent ?? "";
  const tl = gsap.timeline({ paused: true });
  tl.to(name, {
    duration: 1.1,
    scrambleText: { text, chars: "lowerCase", revealDelay: 0.25, speed: 0.6 },
  });
  rows.forEach((r) => tl.call(() => r.classList.add("lit"), undefined, "+=0.32"));
  ScrollTrigger.create({ trigger: sig, start: "top 85%", once: true, onEnter: () => tl.play() });
}

export default function dvp(root: HTMLElement) {
  compiler(root);
  onFlowSelect(root, ({ id, edges }, svg) =>
    edges
      .filter((p) => !p.classList.contains("dotted"))
      .forEach((p, i) => setTimeout(() => packet(svg, p, p.dataset.a !== id, 700), i * 70)),
  );
}
