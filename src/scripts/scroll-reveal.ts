/**
 * One-time section reveals via GSAP ScrollTrigger.
 * Content stays fully visible with no-JS and prefers-reduced-motion.
 * Pre-hide: `.js [data-reveal-child]` in reveal.css (motion allowed only).
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { $$, reduce } from "./dom";

gsap.registerPlugin(ScrollTrigger);

export type RevealOptions = {
  /** CSS selector or element list of `[data-reveal]` sections. */
  sections?: string | HTMLElement[];
  start?: string;
  duration?: number;
  stagger?: number;
  y?: number;
  /** Delay before creating triggers (e.g. wait for the curtain). */
  delay?: number;
};

let registeredFocus = false;

function ensureFocusLift() {
  if (registeredFocus) return;
  registeredFocus = true;
  document.addEventListener("focusin", (e) => {
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-reveal-child]");
    if (!t || t.hasAttribute("data-reveal-done")) return;
    // Opacity only — never visibility:hidden, so off-screen rows stay focusable.
    gsap.set(t, { opacity: 1, y: 0, clearProps: "transform" });
    t.setAttribute("data-reveal-done", "");
  });
}

function childrenOf(section: HTMLElement): HTMLElement[] {
  return $$<HTMLElement>(":scope [data-reveal-child]", section).filter(
    (el) => !el.hasAttribute("data-reveal-done") && !el.closest("[hidden], .sr-only"),
  );
}

/** Reveal sections once as they enter the viewport. Returns a disposer. */
export function initSectionReveals(opts: RevealOptions = {}): () => void {
  ensureFocusLift();
  const sections =
    typeof opts.sections === "string"
      ? $$<HTMLElement>(opts.sections)
      : (opts.sections ?? $$<HTMLElement>("[data-reveal]"));
  if (!sections.length) return () => {};

  const start = opts.start ?? "top 88%";
  const duration = opts.duration ?? 0.6;
  const stagger = opts.stagger ?? 0.07;
  const y = opts.y ?? 16;
  const delay = opts.delay ?? 0;

  const cleanups: (() => void)[] = [];
  let cancelled = false;
  let timer = 0;

  const showAll = () => {
    sections.forEach((s) => {
      childrenOf(s).forEach((el) => {
        el.setAttribute("data-reveal-done", "");
        gsap.set(el, { clearProps: "opacity,transform" });
      });
    });
  };

  const run = () => {
    if (cancelled) return;
    if (reduce()) {
      showAll();
      return;
    }

    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const local: (() => void)[] = [];
      for (const section of sections) {
        const items = childrenOf(section);
        if (!items.length) continue;
        // Opacity (not autoAlpha): keep visibility so keyboard focus still works off-screen.
        gsap.set(items, { opacity: 0, y });
        const tween = gsap.to(items, {
          opacity: 1,
          y: 0,
          duration,
          ease: "power3.out",
          stagger,
          clearProps: "transform",
          scrollTrigger: {
            trigger: section,
            start,
            once: true,
            onEnter: () => items.forEach((el) => el.setAttribute("data-reveal-done", "")),
          },
        });
        local.push(() => {
          tween.scrollTrigger?.kill();
          tween.kill();
          items.forEach((el) => {
            el.setAttribute("data-reveal-done", "");
            gsap.set(el, { clearProps: "opacity,transform" });
          });
        });
      }
      // Failsafe: never leave content hidden if ScrollTrigger never fires.
      const failsafe = window.setTimeout(showAll, 4000);
      local.push(() => clearTimeout(failsafe));
      return () => local.forEach((f) => f());
    });
    cleanups.push(() => mm.revert());
    if (document.fonts?.ready) void document.fonts.ready.then(() => ScrollTrigger.refresh());
  };

  if (delay > 0) timer = window.setTimeout(run, delay * 1000);
  else run();

  return () => {
    cancelled = true;
    clearTimeout(timer);
    cleanups.forEach((f) => f());
  };
}

/** Curtain delay for case-study pages that open covered. */
export function curtainRevealDelay(): number {
  const curtain = document.getElementById("t-curtain");
  if (!curtain || curtain.hidden) return 0;
  if (document.documentElement.classList.contains("t-covered")) return 0.85;
  if (curtain.classList.contains("covered")) return 0.85;
  return 0;
}
