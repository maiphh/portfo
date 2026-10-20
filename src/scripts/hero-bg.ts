/**
 * Hero background: the ghost paper layer drifts slightly with the pointer.
 * The grid sweep, sparks, and paper float are pure CSS; this only adds parallax
 * for hovering pointers, and does nothing under prefers-reduced-motion.
 */
import { gsap } from "gsap";
import { $, reduce } from "./dom";

export function initHeroBg() {
  if (reduce()) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const hero = $("[data-hero]");
  const layer = hero && $("[data-hbg='pages']", hero);
  if (!hero || !layer) return;

  const x = gsap.quickTo(layer, "x", { duration: 0.9, ease: "expo.out" });
  const y = gsap.quickTo(layer, "y", { duration: 0.9, ease: "expo.out" });

  const move = (e: PointerEvent) => {
    const r = hero.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    x(nx * -18);
    y(ny * -12);
  };
  const leave = () => {
    x(0);
    y(0);
  };

  hero.addEventListener("pointermove", move);
  hero.addEventListener("pointerleave", leave);
}
