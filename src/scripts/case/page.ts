/**
 * Case-study page behaviour (components/case/CaseStudy.astro):
 * - ?dev shows the TODO slots;
 * - the depth rail marks the section in view;
 * - deep dives are open on wide screens and an accordion on narrow ones;
 * - "Full stack with versions" opens the stack table;
 * - the page's motion module (one authored moment + its flow select effect) loads only
 *   without reduced motion.
 */
const page = document.querySelector<HTMLElement>("[data-case]");

const motions: Record<string, () => Promise<{ default: (root: HTMLElement) => void }>> = {
  ocr: () => import("./ocr"),
  rag: () => import("./rag"),
  dvp: () => import("./dvp"),
  op: () => import("./op"),
  ecom: () => import("./ecom"),
  poet: () => import("./poet"),
};

if (page) {
  if (/[?&]dev\b/.test(location.search))
    for (const el of page.querySelectorAll<HTMLElement>("[data-dev-only]")) el.hidden = false;

  // Depth rail.
  const links = [...page.querySelectorAll<HTMLAnchorElement>("[data-rail] a")];
  const targets = links
    .map((a) => document.querySelector<HTMLElement>(a.hash))
    .filter((t): t is HTMLElement => t !== null);
  const setCurrent = (id: string) => {
    for (const a of links) {
      if (a.hash === `#${id}`) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
  };
  const io = new IntersectionObserver(
    (entries) => {
      const seen = entries.filter((e) => e.isIntersecting);
      const last = seen.at(-1);
      if (last) setCurrent(last.target.id);
    },
    { rootMargin: "-30% 0px -60% 0px" },
  );
  for (const t of targets) io.observe(t);

  // Highlights: open on wide screens.
  const wide = matchMedia("(min-width: 900px)");
  const dives = [...page.querySelectorAll<HTMLDetailsElement>("[data-dive]")];
  const syncDives = () => {
    for (const d of dives) d.open = wide.matches;
  };
  syncDives();
  wide.addEventListener("change", syncDives);

  // "Full stack with versions" → open the table first.
  const stack = page.querySelector<HTMLDetailsElement>("#stack");
  for (const a of page.querySelectorAll("[data-open-stack]"))
    a.addEventListener("click", () => {
      if (stack) stack.open = true;
    });
  if (location.hash === "#stack" && stack) stack.open = true;

  // The promo cut: muted, plays only while in view and only without reduced motion. With
  // reduced motion it stays on its poster until someone presses play.
  const video = page.querySelector<HTMLVideoElement>("[data-case-video]");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  if (video) {
    // A pause we didn't cause (the visitor's) stops the in-view autoplay for good.
    let touched = false;
    let ours = false;
    video.addEventListener("pause", () => {
      if (ours) ours = false;
      else touched = true;
    });
    new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (e.isIntersecting && !still.matches && !touched) {
          video.loop = true;
          void video.play().catch(() => {});
        } else if (!e.isIntersecting && !video.paused) {
          ours = true;
          video.pause();
        }
      },
      { threshold: 0.5 },
    ).observe(video);
  }

  const key = page.dataset.motion;
  const load = key ? motions[key] : undefined;
  if (load && !matchMedia("(prefers-reduced-motion: reduce)").matches)
    void load().then((m) => m.default(page));
}
