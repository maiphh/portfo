/**
 * Hero A · Title intro (components/case/CaseHeroTitle.astro, HERO-A-SPEC.md §4–5).
 * Once per load: the outline letters rise, an accent scan line sweeps once and leaves the
 * filled name behind, the headline and side copy rise, the accent mark draws, and the scan
 * "lands" as the rail's hairline. On scroll the name lifts and shrinks a little as the rail
 * takes over; scrolling back up into the hero repeats a faint line-only pass, at most once
 * every 20 s. No timed loop.
 *
 * Transform/opacity/visibility only. Reduced motion and no-JS show the end state that is
 * already in the HTML (only loaded without reduced motion; gsap.matchMedia also reverts
 * everything if the preference turns on mid-visit).
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

const rise = (tl: gsap.core.Timeline, els: Element[], at: number, stagger = 0.07): void => {
  if (els.length)
    tl.from(els, { y: 18, autoAlpha: 0, duration: 0.7, ease: "power3.out", stagger }, at);
};

function intro(hero: HTMLElement, delay: number): () => void {
  const q = <T extends Element>(s: string, el: ParentNode = hero) => el.querySelector<T>(s);
  const stage = q<HTMLElement>(".cs-hero-a__stage");
  const name = q<HTMLElement>(".cs-hero-a__name");
  const ol = q<HTMLElement>(".cs-hero-a__ol");
  const fill = q<HTMLElement>(".cs-hero-a__fill");
  const fin = q<HTMLElement>(".cs-hero-a__fill-in");
  if (!stage || !name || !ol || !fill || !fin) return () => {};
  const sw = q<HTMLElement>(".cs-hero-a__sweep");
  const tag = sw ? q<HTMLElement>("b", sw) : null;
  const ln = document.querySelector<HTMLElement>(".cs2-rail__ln");
  const W = () => fin.scrollWidth;

  const split = SplitText.create(ol, { type: "words,chars" });
  // `data-anim` marks the clipped mid-intro state (the overflow audit skips it); at the end the
  // fill's transforms are cleared so the name rests on plain layout.
  hero.setAttribute("data-anim", "");
  const tl = gsap.timeline({
    delay,
    onComplete: () => {
      gsap.set([fill, fin], { clearProps: "transform" });
      hero.removeAttribute("data-anim");
    },
  });
  gsap.set(stage, { visibility: "visible" });
  gsap.set(ol, { autoAlpha: 1 });
  gsap.set(fill, { xPercent: -100 });
  gsap.set(fin, { xPercent: 100 });
  rise(
    tl,
    [q(".cs-hero-a__meta")].filter((x): x is Element => x !== null),
    0,
  );
  tl.from(split.chars, { yPercent: 115, duration: 1.1, ease: "expo.out", stagger: 0.035 }, 0.05)
    .to(fill, { xPercent: 0, duration: 1.3, ease: "power2.inOut" }, 0.75)
    .to(fin, { xPercent: 0, duration: 1.3, ease: "power2.inOut" }, 0.75)
    .to(ol, { autoAlpha: 0, duration: 0.5 }, 2.05);
  if (sw) {
    tl.set(sw, { autoAlpha: 1, x: 0 }, 0.75)
      .to(sw, { x: W, duration: 1.3, ease: "power2.inOut" }, 0.75)
      .to(sw, { autoAlpha: 0, duration: 0.35 }, 2.0);
    // The tag slides to the trailing side so it never runs off the right edge.
    if (tag)
      tl.fromTo(
        tag,
        { xPercent: 0, x: 0 },
        { xPercent: -100, x: -24, duration: 1.3, ease: "power2.inOut" },
        0.75,
      );
  }
  rise(
    tl,
    [q(".cs-hero-a__line")].filter((x): x is Element => x !== null),
    1.05,
  );
  rise(tl, [...hero.querySelectorAll(".cs-hero-a__side > *")], 1.25);
  const mk = [...hero.querySelectorAll(".hx-mk")];
  if (mk.length)
    tl.fromTo(mk, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "expo.inOut" }, 1.6);
  if (ln) tl.fromTo(ln, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: "expo.inOut" }, 1.9);

  // On scroll the name lifts and shrinks a little as the rail takes over.
  const lift = gsap.to(name, {
    yPercent: -14,
    scale: 0.96,
    transformOrigin: "0 0",
    ease: "none",
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
  });
  // Back into the hero: one faint line-only pass, at most every 20 s, never during the intro.
  let last = performance.now();
  const back = sw
    ? ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: "bottom 35%",
        onEnterBack: () => {
          const t = performance.now();
          if (t - last < 20000 || tl.isActive()) return;
          last = t;
          gsap
            .timeline()
            .set(tag, { autoAlpha: 0 })
            .set(sw, { x: 0, autoAlpha: 0 })
            .to(sw, { autoAlpha: 0.45, duration: 0.25 })
            .to(sw, { x: W, duration: 1.5, ease: "power1.inOut" }, 0)
            .to(sw, { autoAlpha: 0, duration: 0.3 }, 1.25)
            .set(tag, { autoAlpha: 1 });
        },
      })
    : null;

  return () => {
    back?.kill();
    lift.scrollTrigger?.kill();
    lift.kill();
    tl.kill();
    hero.removeAttribute("data-anim");
    split.revert();
    gsap.set([stage, name, ol, fill, fin, sw, tag, ln, ...mk].filter(Boolean), {
      clearProps: "all",
    });
    gsap.set(
      [...hero.querySelectorAll(".cs-hero-a__meta, .cs-hero-a__line, .cs-hero-a__side > *")],
      {
        clearProps: "all",
      },
    );
  };
}

export default function heroA(hero: HTMLElement): void {
  // Case pages open under the transition curtain (GsapTransitions.astro); let it start folding
  // away before the name rises.
  const curtain = document.getElementById("t-curtain");
  let delay = curtain && !curtain.hidden ? 0.5 : 0;
  let mm: gsap.MatchMedia | null = null;
  const play = () => {
    mm?.revert();
    mm = gsap.matchMedia();
    const d = delay;
    delay = 0; // only the first run waits for the curtain
    mm.add("(prefers-reduced-motion: no-preference)", () => intro(hero, d));
    ScrollTrigger.refresh();
  };
  // A width change re-lays the name: replay (debounced); height-only changes (mobile URL bar) don't.
  let lw = innerWidth;
  let rt = 0;
  addEventListener("resize", () => {
    if (innerWidth === lw) return;
    lw = innerWidth;
    clearTimeout(rt);
    rt = window.setTimeout(play, 250);
  });
  void document.fonts.ready.then(play);
}
