import { gsap } from "gsap";

let animation: gsap.core.Timeline | undefined;
/** A short, non-looping print; static when motion is reduced or the tab is hidden. */
export function printReceipt(root: HTMLElement, stamped: boolean) {
  animation?.kill();
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const receipt = root.querySelector(".receipt");
  const printer = root.querySelector(".b-printer");
  const stamp = root.querySelector("[data-stamp]");
  if (!receipt || !printer) return;
  animation = gsap.timeline();
  animation.fromTo(receipt, { y: -12 }, { y: 0, duration: 0.4, ease: "steps(4)" });
  animation.fromTo(printer, { y: -2 }, { y: 0, duration: 0.15 }, "<");
  if (stamped && stamp)
    animation.fromTo(stamp, { scale: 1.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2 });
}

export function feedReceipt(root: HTMLElement) {
  if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const receipt = root.querySelector(".receipt");
  if (receipt) gsap.fromTo(receipt, { y: -7 }, { y: 0, duration: 0.3, overwrite: "auto" });
}
