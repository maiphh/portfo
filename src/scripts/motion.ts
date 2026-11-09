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

function dash<T extends SVGGeometryElement>(paths: T[]): T[] {
  paths.forEach((p) => {
    const L = p.getTotalLength();
    p.style.strokeDasharray = String(L);
    p.style.strokeDashoffset = String(L);
  });
  return paths;
}

export function initMotion() {
  gsap.defaults({ ease: "expo.out", duration: 0.9 });

  // Navigation feedback (not decoration): always on, created top-to-bottom.
  const navLinks = $$<HTMLAnchorElement>(".nav .wrap > ul a");
  $$("main > section[id]").forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec,
      start: "top 45%",
      end: "bottom 45%",
      refreshPriority: -1,
      onToggle: (self) => {
        if (!self.isActive) return;
        navLinks.forEach((a) => {
          if (a.getAttribute("href") === "#" + sec.id) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      },
    });
  });
  const setBar = gsap.quickSetter("[data-scanbar]", "scaleX");
  ScrollTrigger.create({
    start: 0,
    end: "max",
    refreshPriority: -2,
    onUpdate: (s) => setBar(s.progress),
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
      const sheet = $("[data-sheet]");
      const doc = $("[data-doc]");
      const leadersSvg = $<SVGSVGElement>("[data-leaders]");
      if (!sheet || !doc || !leadersSvg) return;

      // Leader lines: each detected field in the CV is named in extract.json (desktop only).
      const drawLeaders = (): SVGPathElement[] => {
        if (!c.desktop) {
          leadersSvg.innerHTML = "";
          return [];
        }
        const sr = sheet.getBoundingClientRect();
        const jls = $$(".json .jl");
        const rail = $(".rail");
        const railLeft = (rail?.getBoundingClientRect().left ?? sr.right) - sr.left;
        const dets = $$(".doc .det[data-field]");
        let out = "";
        dets.forEach((det, i) => {
          const key = `"${det.dataset.field ?? ""}"`;
          const jl = jls.find((l) => (l.textContent ?? "").includes(key));
          if (!jl) return;
          const b = det.getBoundingClientRect();
          const t = jl.getBoundingClientRect();
          const x1 = Math.round(b.right + 10 - sr.left);
          const y1 = Math.round(
            (det.closest(".roles") ? b.top - 7 : b.top + b.height / 2) - sr.top,
          );
          const x2 = Math.round(t.left + 14 - sr.left);
          const y2 = Math.round(t.top + t.height / 2 - sr.top);
          const gx = Math.round(railLeft - 18 - (dets.length - 1 - i) * 7);
          const r = Math.min(6, Math.abs(y2 - y1) / 2);
          const s = y2 > y1 ? 1 : -1;
          const d =
            Math.abs(y2 - y1) < 2
              ? `M${x1} ${y1} H${x2 - 4}`
              : `M${x1} ${y1} H${gx - r} q${r} 0 ${r} ${s * r} V${y2 - s * r} q0 ${s * r} ${r} ${s * r} H${x2 - 4}`;
          out += `<path d="${d}"/><circle cx="${x1}" cy="${y1}" r="2.5"/><circle cx="${x2 - 4}" cy="${y2}" r="2"/>`;
        });
        leadersSvg.setAttribute("viewBox", `0 0 ${sr.width} ${sr.height}`);
        leadersSvg.innerHTML = out;
        return $$<SVGPathElement>("path", leadersSvg);
      };
      const leaders = drawLeaders();
      const onResize = () => drawLeaders();
      window.addEventListener("resize", onResize);
      cleanups.push(() => window.removeEventListener("resize", onResize));

      if (c.reduce) {
        // Final states, no movement.
        gsap.set("[data-h]", { visibility: "visible" });
        window.__hero = 1;
        return () => cleanups.forEach((f) => f());
      }

      /* ----- Hero: scan → boxes snap → leaders → JSON types ----- */
      window.__hero = 1;
      const status = $("[data-parse-status]");
      const finalStatus = status?.textContent ?? "";
      const setStatus = (t: string) => () => {
        if (status) status.textContent = t;
      };
      // The visible headline is aria-hidden; an .sr-only copy carries the text, so no aria-label on a span.
      const hl = SplitText.create("[data-hl]", { type: "lines", mask: "lines", aria: "none" });
      const boxes = $$(".doc .box");
      const jl = $$(".json .jl");
      const hero = gsap.timeline({ defaults: { ease: "expo.out", duration: 0.9 } });
      hero
        .set("[data-h]", { visibility: "visible" })
        .from(sheet, { opacity: 0, y: 28, duration: 1.1 })
        .from(".sheet-head", { opacity: 0, duration: 0.5 }, "<0.2")
        .from(".doc .name", { opacity: 0, y: 10 }, "<0.1")
        .from(hl.lines, { yPercent: 105, stagger: 0.09, duration: 1.1 }, "<0.05")
        .from(
          [".doc .lede", ".roles li", ".hero .ctas"],
          { opacity: 0, y: 16, stagger: 0.07 },
          "-=0.75",
        )
        .from(".rail", { opacity: 0, duration: 0.6 }, "<")
        .set(boxes, { opacity: 0 }, 0)
        .set(jl, { clipPath: "inset(0 100% 0 0)" }, 0)
        .addLabel("scan", 1.0)
        .fromTo(
          "[data-scan]",
          { opacity: 1, y: -120 },
          { y: () => sheet.offsetHeight, duration: 1.6, ease: "power1.inOut" },
          "scan",
        )
        .set("[data-scan]", { opacity: 0 });
      const sh = sheet.offsetHeight;
      boxes.forEach((b) => {
        const det = b.parentElement;
        if (!det) return;
        const top = det.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
        hero.fromTo(
          b,
          { opacity: 0, scale: 1.18 },
          { opacity: 1, scale: 1, duration: 0.5 },
          "scan+=" + gsap.utils.clamp(0, 1, (top + 120) / (sh + 120)) * 1.6,
        );
      });
      if (leaders.length)
        hero.to(
          dash(leaders),
          { strokeDashoffset: 0, duration: 0.7, stagger: 0.08, ease: "power2.inOut" },
          "scan+=1.1",
        );
      hero
        .call(setStatus("reading page…"), undefined, 0)
        .call(setStatus("parsing…"), undefined, "scan+=0.9");
      jl.forEach((l, i) => {
        const n = Math.max(1, (l.textContent ?? "").length);
        hero.to(
          l,
          { clipPath: "inset(0 0% 0 0)", duration: n * 0.0065, ease: `steps(${n})` },
          i ? ">" : "scan+=1.1",
        );
      });
      hero.call(setStatus(finalStatus));
      if (leaders.length)
        hero.to(leaders, { opacity: 0.45, duration: 1.2, ease: "power2.out" }, "+=0.6");
      cleanups.push(() => hl.revert());

      /* ----- Cursor inspector: a detection box snaps to the element under the pointer ----- */
      if (c.desktop && c.hover) {
        const insp = $("[data-inspector]");
        const lbl = insp && $(".lbl", insp);
        if (insp && lbl) {
          const cs = $$("i", insp);
          const Q = cs.map((e) => ({
            x: gsap.quickTo(e, "x", { duration: 0.45, ease: "expo.out" }),
            y: gsap.quickTo(e, "y", { duration: 0.45, ease: "expo.out" }),
          }));
          const LX = gsap.quickTo(lbl, "x", { duration: 0.45, ease: "expo.out" });
          const LY = gsap.quickTo(lbl, "y", { duration: 0.45, ease: "expo.out" });
          const targets = (
            [
              [".doc .name", "name"],
              [".doc h1", "headline"],
              [".doc .lede", "summary"],
              [".roles li", "experience"],
              [".hero .ctas", "actions"],
            ] as const
          ).flatMap(([sel, k]) => $$(sel).map((el) => ({ el, k })));
          let cur: (typeof targets)[number] | null = null;
          const move = (e: PointerEvent) => {
            const dr = doc.getBoundingClientRect();
            let best: (typeof targets)[number] | null = null;
            let bd = 1e9;
            targets.forEach((t) => {
              const r = t.el.getBoundingClientRect();
              const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
              const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
              const d = dx * dx + dy * dy;
              if (d < bd) {
                bd = d;
                best = t;
              }
            });
            const hit = best as (typeof targets)[number] | null;
            if (!hit || bd > 90 * 90) {
              gsap.to(insp, { opacity: 0, duration: 0.3, overwrite: true });
              cur = null;
              return;
            }
            const r = hit.el.getBoundingClientRect();
            const x = r.left - dr.left - 12;
            const y = r.top - dr.top - 10;
            let w = Math.min(r.width, hit.el.scrollWidth) + 24;
            const h = r.height + 20;
            if (hit.el.tagName === "LI" || hit.el.classList.contains("ctas")) w = r.width + 24;
            const pos: [number, number][] = [
              [x, y],
              [x + w - 12, y],
              [x, y + h - 12],
              [x + w - 12, y + h - 12],
            ];
            Q.forEach((q, i) => {
              const p = pos[i];
              if (!p) return;
              q.x(p[0]);
              q.y(p[1]);
            });
            LX(x);
            LY(y + h + 4);
            if (cur !== hit) {
              lbl.textContent = hit.k;
              cur = hit;
              gsap.to(insp, { opacity: 1, duration: 0.25, overwrite: true });
            }
          };
          const leave = () => {
            gsap.to(insp, { opacity: 0, duration: 0.3, overwrite: true });
            cur = null;
          };
          doc.addEventListener("pointermove", move);
          doc.addEventListener("pointerleave", leave);
          cleanups.push(() => {
            doc.removeEventListener("pointermove", move);
            doc.removeEventListener("pointerleave", leave);
          });
        }

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
          .from($$(".bar", tlEl), { scaleX: 0, duration: 1.2, stagger: 0.12 })
          .from($$(".bar > *", tlEl), { opacity: 0, duration: 0.4, stagger: 0.05 }, "-=0.8")
          .from($$(".mark", tlEl), { opacity: 0, x: -10, duration: 0.5 }, "-=0.5")
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
    const t = (e.target as HTMLElement | null)?.closest(".bar");
    if (t) gsap.set(t, { opacity: 1 });
  });
  window.addEventListener("resize", () => {
    ScrollTrigger.refresh();
  });
  if (document.fonts?.ready) void document.fonts.ready.then(() => ScrollTrigger.refresh());
}
