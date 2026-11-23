/**
 * Case-study section reveals. Skips Hero A (hero-a.ts) and waits for the curtain
 * so covered arrivals do not fire ScrollTrigger under the closed columns.
 */
import { curtainRevealDelay, initSectionReveals } from "../scroll-reveal";

export function initCaseReveals(root: HTMLElement): () => void {
  const sections = [...root.querySelectorAll<HTMLElement>("[data-reveal]")].filter(
    (el) => !el.closest("[data-hero-a]"),
  );
  return initSectionReveals({
    sections,
    duration: 0.6,
    stagger: 0.07,
    y: 16,
    start: "top 90%",
    delay: curtainRevealDelay(),
  });
}
