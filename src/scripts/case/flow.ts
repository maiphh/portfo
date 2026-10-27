/**
 * Highlights step loop (HIGHLIGHTS-SPEC v2 §5; port of the prototype's js/hl.js). Each drawing
 * (components/case/FlowFigure.astro) is shown whole. While it is on screen a calm loop (~8–9 s)
 * walks the process: each part's accent layer fades up as the flow reaches it, a dot travels each
 * lit wire, and the matching marker and list item get a ring (informational only; nothing is
 * interactive). Opacity and x/y transforms only. Paused offscreen and while the tab is hidden;
 * killed (back to the static picture) if reduced motion turns on, and rebuilt on the other
 * drawing when the 900px breakpoint flips. page.ts loads this only without reduced motion.
 * e2e reads article[data-flow] (running|paused) and article[data-loop] (seconds).
 */
import { gsap } from "gsap";

interface Dive {
  el: HTMLElement;
  N: number;
  vis: boolean;
  tl: gsap.core.Timeline | null;
  fig: HTMLElement | null;
  steps: HTMLElement[];
}

const list = (a: string | undefined): number[] => (a ?? "").split(",").filter(Boolean).map(Number);

/** Consecutive phases merged: [1,2,4] → [[1,2],[4,4]]. */
const runs = (ks: number[]): [number, number][] => {
  const r: [number, number][] = [];
  for (const k of [...ks].sort((a, b) => a - b)) {
    const l = r.at(-1);
    if (l && l[1] === k - 1) l[1] = k;
    else r.push([k, k]);
  }
  return r;
};

const shown = (d: Dive): HTMLElement | undefined =>
  [...d.el.querySelectorAll<HTMLElement>(".fig")].find((f) => f.offsetParent);

function now(d: Dive, k: number): void {
  for (const m of d.fig?.querySelectorAll<HTMLElement>(".hl-mk") ?? [])
    m.classList.toggle("is-now", Number(m.dataset.n) === k);
  d.steps.forEach((li, i) => li.classList.toggle("is-now", i + 1 === k));
}

function kill(d: Dive): void {
  if (!d.tl) return;
  d.tl.kill();
  d.tl = null;
  now(d, 0);
  delete d.el.dataset.flow;
  gsap.set(d.el.querySelectorAll(".fig .lit, .fig .mv, .fig .xm, .fig .base, .fig .dot"), {
    clearProps: "opacity,transform",
  });
}

function build(d: Dive): void {
  const fig = shown(d);
  if (!fig) return;
  d.fig = fig;
  // N=3 → 7.8 + 0.8 s, N=4 → 8 + 0.8 s per loop
  const N = d.N;
  const P = Math.min(2.6, 8 / N);
  const REST = 0.8;
  const tl = gsap.timeline({ repeat: -1, paused: true, defaults: { ease: "sine.inOut" } });
  for (let k = 1; k <= N; k++) tl.call(now, [d, k], (k - 1) * P);
  tl.call(now, [d, 0], N * P);

  // parts: the accent layer comes up for each run of phases the part belongs to, with a 3px lift
  for (const g of fig.querySelectorAll<SVGGElement>(".o:not(.w)")) {
    const mv = g.querySelector(":scope > .mv");
    const lit = g.querySelector(":scope > .mv > .lit");
    if (mv && lit)
      for (const [a, b] of runs(list(g.dataset.lit))) {
        const t0 = (a - 1) * P + 0.15;
        const t1 = b * P - 0.1;
        tl.to(lit, { opacity: 1, duration: 0.5 }, t0)
          .to(mv, { y: -3, duration: 0.5 }, t0)
          .to(lit, { opacity: 0, duration: 0.7 }, t1 - 0.7)
          .to(mv, { y: 0, duration: 0.7 }, t1 - 0.7);
      }
    const xm = g.querySelector(":scope > .mv > .xm");
    const base = g.querySelector(":scope > .mv > .base");
    if (!xm) continue;
    if (g.classList.contains("x")) {
      // struck in the static picture: the strike pulses in its phases
      for (const k of list(g.dataset.x))
        tl.to(xm, { opacity: 0.35, duration: 0.3, yoyo: true, repeat: 1 }, (k - 1) * P + P * 0.45);
    } else if (base) {
      // a strike that happens mid-process shows for its phases only
      for (const [a, b] of runs(list(g.dataset.x))) {
        const t0 = (a - 1) * P + P * 0.45;
        const t1 = b * P - 0.1;
        tl.to(xm, { opacity: 1, duration: 0.35 }, t0)
          .to(base, { opacity: 0.5, duration: 0.35 }, t0)
          .to(xm, { opacity: 0, duration: 0.5 }, t1 - 0.5)
          .to(base, { opacity: 1, duration: 0.5 }, t1 - 0.5);
      }
    }
  }

  // wires: the path brightens for its phases; one dot travels it once per phase
  for (const w of fig.querySelectorAll<SVGGElement>(".w")) {
    const lit = w.querySelector(":scope > .lit");
    const ks = list(w.dataset.lit);
    if (lit)
      for (const [a, b] of runs(ks))
        tl.to(lit, { opacity: 1, duration: 0.4 }, (a - 1) * P).to(
          lit,
          { opacity: 0.5, duration: 0.6 },
          b * P - 0.6,
        );
    const dot = fig.querySelector(`.dot[data-w="${w.dataset.i ?? ""}"]`);
    const pts = (w.dataset.pts ?? "").split(" ").map((p) => p.split(",").map(Number));
    if (!dot || pts.length < 2) continue;
    const seg = pts.slice(1).map((p, i) => {
      const q = pts[i] ?? p;
      return Math.hypot((p[0] ?? 0) - (q[0] ?? 0), (p[1] ?? 0) - (q[1] ?? 0));
    });
    const len = seg.reduce((s, x) => s + x, 0) || 1;
    for (const k of ks) {
      const t0 = (k - 1) * P + 0.2;
      const dur = P * 0.62;
      tl.set(dot, { x: pts[0]?.[0], y: pts[0]?.[1], opacity: 0 }, t0).to(
        dot,
        { opacity: 1, duration: 0.2 },
        t0,
      );
      let t = t0;
      seg.forEach((s, i) => {
        const dd = (dur * s) / len;
        const p = pts[i + 1];
        tl.to(dot, { x: p?.[0], y: p?.[1], duration: dd, ease: "none" }, t);
        t += dd;
      });
      tl.to(dot, { opacity: 0, duration: 0.25 }, t);
    }
  }

  tl.to({}, { duration: REST }, N * P); // a calm rest before the loop restarts
  d.tl = tl;
  d.el.dataset.loop = tl.duration().toFixed(2);
}

export default function flow(root: HTMLElement): void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const wide = matchMedia("(min-width: 900px)");
  const dives: Dive[] = [...root.querySelectorAll<HTMLElement>("article.hl-dv")].map((el) => ({
    el,
    N: Number(el.dataset.n),
    vis: false,
    tl: null,
    fig: null,
    steps: [...el.querySelectorAll<HTMLElement>(".st")],
  }));

  const sync = (d: Dive): void => {
    if (reduce.matches) return kill(d);
    if (d.tl && d.fig !== shown(d)) kill(d);
    if (!d.tl && d.vis) build(d);
    if (!d.tl) return;
    const run = d.vis && !document.hidden;
    if (run) d.tl.play();
    else d.tl.pause();
    d.el.dataset.flow = run ? "running" : "paused";
  };
  const syncAll = () => dives.forEach(sync);

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const d = dives.find((x) => x.el.contains(e.target));
        if (!d) continue;
        d.vis = e.isIntersecting;
        sync(d);
      }
    },
    { threshold: 0.15 },
  );
  for (const d of dives) {
    const fig = d.el.querySelector(".hl-fig");
    if (fig) io.observe(fig);
  }
  document.addEventListener("visibilitychange", syncAll);
  reduce.addEventListener("change", syncAll);
  wide.addEventListener("change", syncAll);
}
