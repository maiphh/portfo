/**
 * DVP motion (loaded by scripts/case/page.ts only without reduced motion):
 * - the authored moment: the plain rule scrambles into its function once the opener is in view,
 *   then, scrubbed with the scroll, the rows are checked one at a time and the one mismatch gets
 *   a coral outline (no shake);
 * - the flow select effect: a chip travels each lit edge once and stops; model edges stay dotted.
 */
import { gsap } from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { onFlowSelect, packet } from "./effects";

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);

function compiler(root: HTMLElement) {
  const sig = root.querySelector<HTMLElement>("[data-compiler]");
  const fn = sig?.querySelector<HTMLElement>("[data-fn]");
  if (!sig || !fn) return;
  const rows = [...sig.querySelectorAll<HTMLElement>("[data-row]")];
  sig.classList.add("is-anim");
  // Scramble only the signature line's text nodes; the markup (keywords) stays.
  const name = [...fn.childNodes].find(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.includes("calculate_"),
  );
  if (name?.textContent) {
    const span = document.createElement("span");
    span.textContent = name.textContent;
    name.replaceWith(span);
    gsap.from(span, {
      duration: 1.1,
      scrambleText: { text: span.textContent, chars: "lowerCase", revealDelay: 0.3 },
      scrollTrigger: { trigger: sig, start: "top 85%", once: true },
    });
  }
  const at = (p: number) =>
    rows.forEach((r, i) => r.classList.toggle("lit", p >= (i + 1) / (rows.length + 1)));
  ScrollTrigger.create({
    trigger: sig,
    start: "top 75%",
    end: "bottom 45%",
    scrub: true,
    onUpdate: (st) => at(st.progress),
    onRefresh: (st) => at(st.progress),
  });
}

export default function dvp(root: HTMLElement) {
  compiler(root);
  onFlowSelect(root, ({ id, edges }, svg) =>
    edges
      .filter((p) => !p.classList.contains("dotted"))
      .forEach((p, i) => setTimeout(() => packet(svg, p, p.dataset.a !== id, 700), i * 70)),
  );
}
