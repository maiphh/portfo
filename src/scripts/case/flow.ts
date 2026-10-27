/**
 * Highlights loops (HIGHLIGHTS-SPEC v3 §5; TS port of the prototype's js/hl.js). Each drawing
 * (components/case/FlowFigure.astro) is the full static scene; this plays its one looping motion
 * from lib/highlights/motion.json. One master timeline per scene (repeat -1, length L) scrubs one
 * child timeline per animated part, each repeating at its own period, so every part lines up
 * again at L. Only x, y, scaleX, scaleY, rotation and opacity are tweened; no CSS animations.
 * Plays only while the figure is on screen and the tab is shown. Everything is built inside a
 * reduced-motion media query, so turning reduced motion on reverts to the static scene. page.ts
 * loads this only without reduced motion.
 * e2e reads svg[data-hl] (running|paused, not data-flow: the flow diagrams own that), svg[data-loop] (L, seconds), and the master timeline
 * on the svg's non-enumerable `hlLoop` property (to seek frames and list the tweened properties).
 */
import { gsap } from "gsap";
import MOTION from "~/lib/highlights/motion.json";

type Props = Partial<Record<"x" | "y" | "scaleX" | "scaleY" | "rotation", number>>;
/** [percent of the track period, value] */
type Stop<T> = [number, T];
interface Track {
  /** Selectors inside the scene svg. */
  t: string[];
  /** Period, s. */
  p: number;
  ease: string;
  opacity?: Stop<number>[];
  transform?: Stop<Props>[];
  origin?: { transformOrigin: string } | { svgOrigin: string };
  /** Rest transform when it is not the identity. */
  base?: Props;
}
interface SceneMotion {
  L: number;
  tracks: Track[];
  delay?: [string, number | { var: string; each: number }][];
}
const SCENES = MOTION as unknown as Record<string, SceneMotion>;
const ID: Required<Props> = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };

function track(el: Element, tr: Track): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true, repeat: -1 });
  if (tr.origin) gsap.set(el, tr.origin);
  const groups: [Stop<gsap.TweenVars>[], gsap.TweenVars][] = [];
  if (tr.opacity)
    groups.push([
      tr.opacity.map(([pc, v]) => [pc, { opacity: v }]),
      { opacity: Number(gsap.getProperty(el, "opacity")) },
    ]);
  const first = tr.transform?.[0];
  if (tr.transform && first) {
    const keys = Object.keys(first[1]) as (keyof Props)[];
    groups.push([tr.transform, Object.fromEntries(keys.map((k) => [k, tr.base?.[k] ?? ID[k]]))]);
  }
  for (const [stops, rest] of groups) {
    const s = stops.slice();
    if ((s[0]?.[0] ?? 0) > 0) s.unshift([0, rest]);
    if ((s.at(-1)?.[0] ?? 100) < 100) s.push([100, rest]);
    const [s0] = s;
    if (s0) tl.set(el, s0[1], 0);
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1],
        b = s[i];
      if (!a || !b) continue;
      const t0 = (a[0] / 100) * tr.p,
        d = ((b[0] - a[0]) / 100) * tr.p;
      if (d > 0) tl.to(el, { ...b[1], duration: d, ease: tr.ease }, t0);
    }
  }
  tl.set({}, {}, tr.p); // pad to the full period
  return tl;
}

function scene(svg: SVGSVGElement, sc: SceneMotion): gsap.core.Timeline {
  const master = gsap.timeline({ paused: true, repeat: -1 });
  for (const tr of sc.tracks)
    for (const el of svg.querySelectorAll(tr.t.join(","))) {
      let d = 0;
      for (const [sel, v] of sc.delay ?? [])
        if (el.matches(sel))
          d =
            typeof v === "number"
              ? v
              : (parseFloat(getComputedStyle(el).getPropertyValue(v.var)) || 0) * v.each;
      const phi = ((-d % tr.p) + tr.p) % tr.p;
      master.fromTo(
        track(el, tr),
        { totalTime: phi },
        { totalTime: phi + sc.L, duration: sc.L, ease: "none" },
        0,
      );
    }
  return master;
}

interface Item {
  svg: SVGSVGElement;
  fig: Element;
  vis: boolean;
  tl: gsap.core.Timeline;
}

export default function flow(root: HTMLElement): void {
  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    const items: Item[] = [];
    for (const svg of root.querySelectorAll<SVGSVGElement>("svg.hl-fig[data-scene]")) {
      const sc = SCENES[svg.dataset.scene ?? ""];
      const fig = svg.closest("figure");
      if (!sc || !fig) continue;
      const tl = scene(svg, sc);
      svg.dataset.loop = sc.L.toFixed(2);
      Object.defineProperty(svg, "hlLoop", { value: tl, configurable: true });
      items.push({ svg, fig, vis: false, tl });
    }
    const sync = (it: Item) => {
      const run = it.vis && !document.hidden;
      if (run) it.tl.play();
      else it.tl.pause();
      it.svg.dataset.hl = run ? "running" : "paused";
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const it = items.find((x) => x.fig === e.target);
          if (!it) continue;
          it.vis = e.isIntersecting;
          sync(it);
        }
      },
      { threshold: 0.15 },
    );
    for (const it of items) {
      sync(it);
      io.observe(it.fig);
    }
    const vis = () => items.forEach(sync);
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      for (const it of items) {
        delete it.svg.dataset.hl;
        delete it.svg.dataset.loop;
        Reflect.deleteProperty(it.svg, "hlLoop");
      }
    };
  });
}
