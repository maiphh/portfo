/**
 * Case-study section reveals. Skips Hero A (hero-a.ts) and waits for the curtain
 * so covered arrivals do not fire ScrollTrigger under the closed columns.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { curtainRevealDelay, initSectionReveals } from "../scroll-reveal";

export function initCaseReveals(root: HTMLElement): () => void {
  const sections = [...root.querySelectorAll<HTMLElement>("[data-reveal]")].filter(
    (el) => !el.closest("[data-hero-a]"),
  );
  const media = gsap.matchMedia();
  media.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.to("[data-scanbar]", {
      scaleX: 1,
      ease: "none",
      scrollTrigger: { trigger: root, start: "top top", end: "bottom bottom", scrub: true },
    });
    // Follow each illustration independently through the viewport. Its internal
    // diagram animation still owns the SVG, and the text stays on the reading grid.
    for (const figure of root.querySelectorAll<HTMLElement>(".hl-dv-fig")) {
      gsap.fromTo(
        figure,
        { scale: 0.89, y: 28 },
        {
          scale: 1,
          y: 0,
          ease: "none",
          scrollTrigger: {
            trigger: figure,
            start: "top 95%",
            end: "center 55%",
            scrub: true,
          },
        },
      );
    }
    const observer = new ResizeObserver(() => ScrollTrigger.refresh());
    observer.observe(root);
    return () => observer.disconnect();
  });
  const disposeReveals = initSectionReveals({
    sections,
    duration: 0.6,
    stagger: 0.07,
    y: 16,
    start: "top 90%",
    delay: curtainRevealDelay(),
  });
  return () => {
    media.revert();
    disposeReveals();
  };
}
