/**
 * Highlights plates (HIGHLIGHTS-SPEC §4; port of the prototype's js/site.js figure()).
 * The HTML already holds the last step of the default story, so no-JS and reduced motion get the
 * finished state. This script steps stories, switches modes and documents, and opens the tip sheet.
 * With motion allowed (gsap.matchMedia) it also runs the entrance, the autoplay and the sparks.
 * Only transform and opacity are animated.
 */
import { gsap } from "gsap";
import { inR } from "~/lib/iso/range";

type Rule = [mode: string | null, cls: string, range: string];
const STEP_MS = 1150;
const AMBIENT_MS = 2600;
const SPARK_S = 0.9;

const shown = (el: Element) => (el as HTMLElement).offsetParent !== null;

/** Move a spark through its build-sampled points (x/y transforms), fading in and out. */
function spark(el: SVGElement) {
  const pts = (el.dataset.pts ?? "")
    .split(" ")
    .map((p) => p.split(",").map(Number) as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const first = pts[0];
  if (!first || pts.length < 2) return;
  const seg = pts.slice(1).map((p, i) => {
    const q = pts[i] ?? first;
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
  });
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  gsap.killTweensOf(el);
  const tl = gsap.timeline({
    onStart: () => void (el.style.willChange = "transform, opacity"),
    onComplete: () => void (el.style.willChange = ""),
  });
  tl.set(el, { x: first[0], y: first[1], autoAlpha: 0 }).to(el, { autoAlpha: 1, duration: 0.08 });
  pts.slice(1).forEach((p, i) => {
    tl.to(el, { x: p[0], y: p[1], duration: (SPARK_S * (seg[i] ?? 0)) / total, ease: "none" });
  });
  tl.to(el, { autoAlpha: 0, duration: 0.12 }, `-=${0.12}`);
}

function plate(P: HTMLElement, mm: gsap.MatchMedia) {
  const box = P.closest("article") ?? P;
  const N = JSON.parse(P.dataset.n ?? "{}") as Record<string, number>;
  const READ = JSON.parse(P.dataset.read ?? "{}") as Record<string, string[]>;
  const out = P.querySelector<HTMLOutputElement>("output.read");
  const sheet = P.querySelector<HTMLElement>(".sheet");
  let mode = P.dataset.mode ?? "d";
  const last = () => (N[mode] ?? 1) - 1;
  let step = last();
  let on = false;
  let seen = false;
  let motion = false;
  let timer = 0;
  let amb = 0;
  let opener: HTMLButtonElement | null = null;
  let entrance: gsap.core.Timeline | null = null;

  const els: [Element, Rule[]][] = [];
  for (const el of P.querySelectorAll("*")) {
    const r: Rule[] = [];
    for (const at of el.attributes) {
      let m = /^data-s-(.+)$/.exec(at.name);
      if (m?.[1]) {
        r.push([null, m[1], at.value]);
        continue;
      }
      m = /^data-m-([a-z]+)-(.+)$/.exec(at.name);
      if (m?.[1] && m[2]) r.push([m[1], m[2], at.value]);
    }
    if (r.length) els.push([el, r]);
  }

  const apply = (fire: boolean) => {
    for (const [el, r] of els) {
      const cls = new Map<string, boolean>();
      for (const [m, c, v] of r) {
        if (m && m !== mode) continue;
        if (!m && r.some((x) => x[0] === mode && x[1] === c)) continue;
        cls.set(c, inR(step, v));
      }
      for (const [c, v] of cls) {
        if (c === "go" || c === "amb") {
          if (v && fire && on && motion && shown(el.closest(".stage") ?? el))
            spark(el as SVGElement);
          continue;
        }
        el.classList.toggle(c, v);
      }
    }
    if (out) out.textContent = READ[mode]?.[step] ?? "";
  };
  /** User input announces the step; autoplay does not. */
  const live = (v: "off" | "polite") => out?.setAttribute("aria-live", v);
  const stop = () => {
    clearInterval(timer);
    timer = 0;
  };
  const toEnd = () => {
    stop();
    step = last();
    apply(false);
  };
  const play = () => {
    stop();
    if (!motion) return toEnd();
    live("off");
    step = 0;
    apply(true);
    timer = window.setInterval(() => {
      if (!on) return;
      if (step >= last()) {
        stop();
        live("polite");
        return;
      }
      step++;
      apply(true);
    }, STEP_MS);
  };

  box.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) =>
    b.addEventListener("click", () => {
      stop();
      live("polite");
      step = Math.max(0, Math.min(last(), step + Number(b.dataset.step)));
      apply(true);
    }),
  );
  P.querySelectorAll<HTMLButtonElement>("[data-play]").forEach((b) =>
    b.addEventListener("click", play),
  );
  const modeBtns = [...box.querySelectorAll<HTMLButtonElement>("button[data-mode]")];
  for (const b of modeBtns)
    b.addEventListener("click", () => {
      mode = b.dataset.mode ?? "d";
      P.dataset.mode = mode;
      for (const x of modeBtns) x.setAttribute("aria-pressed", String(x === b));
      live("polite");
      toEnd();
    });

  const docBtns = [...box.querySelectorAll<HTMLButtonElement>("button[data-doc]")];
  let doc = docBtns[0]?.dataset.doc ?? "";
  for (const b of docBtns)
    b.addEventListener("click", () => {
      const next = b.dataset.doc ?? "";
      if (next === doc) return;
      for (const x of docBtns) x.setAttribute("aria-pressed", String(x === b));
      for (const st of P.querySelectorAll(".stage")) {
        const prev = st.querySelector(`.fbox-set[data-set="${doc}"]`);
        const nx = st.querySelector(`.fbox-set[data-set="${next}"]`);
        if (motion) {
          if (prev) gsap.to(prev, { autoAlpha: 0, duration: 0.25 });
          if (nx) gsap.fromTo(nx, { autoAlpha: 0, y: -4 }, { autoAlpha: 1, y: 0, duration: 0.3 });
        } else {
          if (prev) gsap.set(prev, { autoAlpha: 0 });
          if (nx) gsap.set(nx, { autoAlpha: 1, y: 0 });
        }
      }
      doc = next;
      P.querySelectorAll(".dlb").forEach((l) =>
        l.classList.toggle("sel", l.classList.contains(`dlb-${doc}`)),
      );
      P.querySelectorAll('.lt[class*="doc-"]').forEach((g) => {
        const m = /doc-([a-z]+)/.exec(g.getAttribute("class") ?? "");
        if (m) g.classList.toggle("hot", m[1] === doc);
      });
    });

  // Tips: the label buttons (keyboard) and the drawn parts (pointer) open the same sheet.
  const close = () => {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    P.querySelectorAll("button.lb[aria-expanded=true]").forEach((b) =>
      b.setAttribute("aria-expanded", "false"),
    );
    opener?.focus();
    opener = null;
  };
  const open = (b: HTMLButtonElement) => {
    if (!sheet) return;
    if (b.getAttribute("aria-expanded") === "true") return close();
    P.querySelectorAll("button.lb").forEach((x) => x.setAttribute("aria-expanded", "false"));
    const t = sheet.querySelector("b");
    const p = sheet.querySelector("p");
    if (t) t.textContent = b.querySelector("b")?.textContent ?? "";
    if (p) p.textContent = b.dataset.tip ?? "";
    sheet.hidden = false;
    b.setAttribute("aria-expanded", "true");
    opener = b;
  };
  P.querySelectorAll<HTMLButtonElement>("button.lb").forEach((b) => {
    if (sheet) b.setAttribute("aria-controls", sheet.id);
    b.addEventListener("click", () => open(b));
  });
  P.querySelectorAll<SVGElement>("svg [data-k]").forEach((g) =>
    g.addEventListener("click", () => {
      const b = g
        .closest(".stage")
        ?.querySelector<HTMLButtonElement>(`button.lb[data-k="${g.dataset.k ?? ""}"]`);
      if (b) open(b);
    }),
  );
  sheet?.querySelector(".x")?.addEventListener("click", close);
  P.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  const ambient = () => {
    if (timer || !on || !motion) return;
    for (const st of P.querySelectorAll(".stage")) {
      if (!shown(st)) continue;
      st.querySelectorAll<SVGElement>(".spark").forEach((p) => {
        const k = p.getAttribute(`data-m-${mode}-go`) ?? p.dataset.sGo ?? "";
        if ((k && inR(step, k)) || p.dataset.sAmb !== undefined) spark(p);
      });
    }
  };
  const enter = () => {
    const st = [...P.querySelectorAll(".stage")].find(shown);
    if (!st || !motion) return play();
    const its = st.querySelectorAll<SVGElement>("svg .it");
    gsap.set(its, { willChange: "transform, opacity" });
    entrance = gsap
      .timeline({
        onComplete: () => {
          gsap.set(its, { clearProps: "willChange" });
          entrance = null;
          play();
        },
      })
      .from(its, {
        y: -14,
        autoAlpha: 0,
        duration: 0.45,
        ease: "power3.out",
        stagger: { each: 0.035 },
      })
      .from(
        st.querySelectorAll(".lb"),
        { autoAlpha: 0, duration: 0.3, stagger: 0.02, clearProps: "opacity,visibility" },
        "-=.2",
      );
  };

  new IntersectionObserver(
    ([en]) => {
      on = !!en?.isIntersecting;
      if (on && !seen) {
        seen = true;
        if (motion) enter();
      }
      // Off-screen: the story stops at its end and waits for Replay.
      if (!on && timer) {
        toEnd();
        live("polite");
      }
    },
    { threshold: 0.3 },
  ).observe(P);

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    motion = true;
    amb = window.setInterval(ambient, AMBIENT_MS);
    return () => {
      motion = false;
      clearInterval(amb);
      entrance?.progress(1).kill();
      entrance = null;
      P.querySelectorAll(".spark").forEach((s) => gsap.killTweensOf(s));
      gsap.set(P.querySelectorAll(".spark"), { autoAlpha: 0 });
      live("polite");
      toEnd();
    };
  });
}

export default function plates(root: HTMLElement) {
  const mm = gsap.matchMedia();
  root.querySelectorAll<HTMLElement>(".plate").forEach((p) => plate(p, mm));
}
