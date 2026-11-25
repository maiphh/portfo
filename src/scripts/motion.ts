/**
 * Motion for the home page (GSAP from npm). Everything here only animates toward a final
 * state that is already readable in the HTML, so no-JS and reduced motion stay complete.
 * GSAP practice: matchMedia contexts with cleanup, timelines with labels, ScrollTrigger
 * pin/scrub/once, SplitText with masks + aria, MotionPath, quickTo for pointer work.
 */
import { gsap } from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { $, $$, fmt } from "./dom";
import { initSectionReveals } from "./scroll-reveal";

gsap.registerPlugin(ScrollTrigger, SplitText, MotionPathPlugin);

function countUp(el: HTMLElement) {
  const end = parseFloat(el.dataset.count ?? "0");
  const d = Number(el.dataset.decimals ?? 0);
  const pre = el.dataset.prefix ?? "";
  const suf = el.dataset.suffix ?? "";
  const o = { v: 0 };
  return gsap.to(o, {
    v: end,
    duration: 1.4,
    ease: "expo.out",
    onUpdate: () => {
      el.textContent = pre + fmt(o.v, d) + suf;
    },
  });
}

export function initMotion() {
  gsap.defaults({ ease: "expo.out", duration: 0.9 });

  const setBar = gsap.quickSetter("[data-scanbar]", "scaleX");
  ScrollTrigger.create({
    start: 0,
    end: "max",
    refreshPriority: -2,
    onUpdate: (s) => setBar(s.progress),
  });

  // Section reveals (Hero has its own intro; Contact owns band/words motion).
  initSectionReveals({
    sections:
      "#timeline[data-reveal], #work[data-reveal], #activity[data-reveal], #how[data-reveal]",
    duration: 0.6,
    stagger: 0.07,
    y: 16,
  });

  const mm = gsap.matchMedia();
  mm.add(
    {
      desktop: "(min-width: 1024px)",
      mobile: "(max-width: 1023px)",
      reduce: "(prefers-reduced-motion: reduce)",
      hover: "(hover: hover) and (pointer: fine)",
    },
    (ctx) => {
      const c = ctx.conditions ?? {};
      const cleanups: (() => void)[] = [];
      if (c.reduce) {
        // Final states are already in the HTML; just lift the JS-on curtain.
        gsap.set("[data-h]", { visibility: "visible" });
        return () => cleanups.forEach((f) => f());
      }

      gsap.to("[data-ascii-stage]", {
        yPercent: c.desktop ? 18 : 8,
        ease: "none",
        scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "bottom top", scrub: true },
      });

      // Open the featured demo into place, then bring each project group up row by row.
      const demo = $(".sw-demo");
      if (demo) {
        gsap.from(demo, {
          scale: c.desktop ? 0.88 : 0.94,
          y: c.desktop ? 48 : 22,
          transformOrigin: "50% 85%",
          ease: "none",
          scrollTrigger: {
            trigger: demo.parentElement,
            start: "top 95%",
            end: "top 40%",
            scrub: true,
          },
        });
      }
      for (const list of $$(".sw-list")) {
        gsap.from($$(":scope > li", list), {
          x: c.desktop ? -38 : -14,
          stagger: 0.18,
          ease: "power2.out",
          scrollTrigger: { trigger: list, start: "top 95%", end: "bottom 80%", scrub: true },
        });
      }

      if (c.desktop && c.hover) {
        // Magnetic CTAs
        $$("[data-magnet]").forEach((b) => {
          const mx = gsap.quickTo(b, "x", { duration: 0.6, ease: "expo.out" });
          const my = gsap.quickTo(b, "y", { duration: 0.6, ease: "expo.out" });
          const mv = (e: PointerEvent) => {
            const r = b.getBoundingClientRect();
            mx((e.clientX - r.left - r.width / 2) * 0.28);
            my((e.clientY - r.top - r.height / 2) * 0.35);
          };
          const lv = () => {
            mx(0);
            my(0);
          };
          b.addEventListener("pointermove", mv);
          b.addEventListener("pointerleave", lv);
          cleanups.push(() => {
            b.removeEventListener("pointermove", mv);
            b.removeEventListener("pointerleave", lv);
          });
        });
      }

      /* ----- Split headings ----- */
      $$("[data-split]").forEach((h) => {
        const s = SplitText.create(h, { type: "lines", mask: "lines", aria: "auto" });
        gsap.from(s.lines, {
          yPercent: 105,
          stagger: 0.08,
          duration: 1.1,
          scrollTrigger: { trigger: h, start: "top 88%", once: true },
        });
        cleanups.push(() => s.revert());
      });

      /* ----- Timeline bars grow along time ----- */
      const tlEl = $("[data-tl]");
      if (tlEl) {
        gsap
          .timeline({ scrollTrigger: { trigger: tlEl, start: "top 75%", once: true } })
          .from($$("[data-tl-bar]", tlEl), { scaleX: 0, duration: 1.2, stagger: 0.12 })
          .from(
            $$("[data-tl-bar] > *", tlEl),
            { opacity: 0, duration: 0.4, stagger: 0.05 },
            "-=0.8",
          )
          .from($$("[data-tl-mark]", tlEl), { opacity: 0, x: -10, duration: 0.5 }, "-=0.5")
          .from($(".now", tlEl), { scaleY: 0, transformOrigin: "top", duration: 0.8 }, "-=0.4");
      }

      /* ----- GitHub: heatmap fills, numbers count ----- */
      const hm = $("[data-heatmap]");
      if (hm)
        gsap.from($$("i", hm), {
          opacity: 0,
          duration: 0.4,
          ease: "power1.out",
          stagger: { amount: 1.2, from: "end" },
          scrollTrigger: { trigger: hm, start: "top 85%", once: true },
        });
      $$("#activity [data-count]").forEach((el) =>
        ScrollTrigger.create({
          trigger: el,
          start: "top 90%",
          once: true,
          onEnter: () => countUp(el),
        }),
      );

      /* ----- Contact: band opens like a page being turned up, words snap into boxes ----- */
      const band = $("[data-band]");
      if (band) {
        gsap.fromTo(
          band,
          // Scale only: fading the band left its grey text below AA contrast until scrolled in.
          { scale: 0.93 },
          {
            scale: 1,
            ease: "none",
            scrollTrigger: { trigger: band, start: "top bottom", end: "top 35%", scrub: 0.5 },
          },
        );
        gsap.from($$("[data-words] span"), {
          scale: 0.82,
          opacity: 0,
          duration: 0.7,
          stagger: 0.08,
          scrollTrigger: { trigger: band, start: "top 60%", once: true },
        });
      }

      /* ----- Footer name ----- */
      const footName = $("[data-footname]");
      if (footName) {
        const fn = SplitText.create(footName, { type: "chars", mask: "chars" });
        gsap.from(fn.chars, {
          yPercent: 100,
          stagger: 0.03,
          duration: 1,
          scrollTrigger: { trigger: footName, start: "top 95%", once: true },
        });
        cleanups.push(() => fn.revert());
      }

      return () => cleanups.forEach((f) => f());
    },
  );

  // Reveals never trap content: anything focused becomes visible.
  document.addEventListener("focusin", (e) => {
    const t = (e.target as HTMLElement | null)?.closest("[data-tl-bar]");
    if (t) gsap.set(t, { opacity: 1 });
  });
  window.addEventListener("resize", () => {
    ScrollTrigger.refresh();
  });
  if (document.fonts?.ready) void document.fonts.ready.then(() => ScrollTrigger.refresh());
}
