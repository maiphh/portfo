/**
 * Case-study page behaviour (components/case/CaseStudy.astro):
 * - ?dev shows the TODO slots;
 * - the depth rail marks the section in view;
 * - highlights: "The detail" is open on wide screens and folded on narrow ones;
 * - "Full stack with versions" opens the stack table;
 * - the short cut (OCR, DVP) autoplays muted while half in view, unless reduced motion or a
 *   data saver is on: then a play button sits on its poster;
 * - without reduced motion: the Hero A intro (hero-a.ts), the page's flow select effect, and the
 *   highlights' step loop (flow.ts). With reduced motion the static drawings stay, as without JS.
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
  // The short cut sits between Overview and the rest, and counts as Overview.
  const cut = document.getElementById("video");
  if (cut) targets.splice(1, 0, cut);
  const seen = new Map<Element, boolean>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting);
      const on = targets.filter((t) => seen.get(t)).at(-1);
      if (on) setCurrent(on === cut ? "overview" : on.id);
    },
    { rootMargin: "-120px 0px -55% 0px" },
  );
  for (const t of targets) io.observe(t);

  // Highlights: "The detail" is open on wide screens, where its summary leaves the tab order and
  // ignores clicks; on phones it is folded until the reader opens it.
  const wide = matchMedia("(min-width: 900px)");
  const dives = [...page.querySelectorAll<HTMLDetailsElement>("[data-dive]")];
  const touched = new WeakSet<HTMLDetailsElement>();
  const syncDives = () => {
    for (const d of dives) {
      const s = d.querySelector("summary");
      if (wide.matches) {
        d.open = true;
        if (s) s.tabIndex = -1;
      } else {
        s?.removeAttribute("tabindex");
        if (!touched.has(d)) d.open = false;
      }
    }
  };
  for (const d of dives)
    d.querySelector("summary")?.addEventListener("click", (e) => {
      if (wide.matches) e.preventDefault();
      else touched.add(d);
    });
  syncDives();
  wide.addEventListener("change", syncDives);

  // "Full stack with versions" → open the table first.
  const stack = page.querySelector<HTMLDetailsElement>("#stack");
  for (const a of page.querySelectorAll("[data-open-stack]"))
    a.addEventListener("click", () => {
      if (stack) stack.open = true;
    });
  if (location.hash === "#stack" && stack) stack.open = true;

  // The poster is set only as the video frame nears the viewport (200px ahead), not with the
  // page: a poster="" in the markup is fetched right away, even with preload="none".
  const cutVideo = page.querySelector<HTMLVideoElement>("video[data-poster-src]");
  if (cutVideo) {
    const load = () => {
      if (!cutVideo.getAttribute("poster")) cutVideo.poster = cutVideo.dataset.posterSrc ?? "";
    };
    if (!("IntersectionObserver" in window)) load();
    else {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            load();
          }
        },
        { rootMargin: "200px 0px" },
      );
      io.observe(cutVideo.closest(".cs2-video-frame") ?? cutVideo);
    }
  }

  // The short cut: muted, plays only while half in view. Reduced motion, Save-Data or
  // prefers-reduced-data: no autoplay; a play button sits on the poster instead.
  const video = page.querySelector<HTMLVideoElement>("[data-case-video]");
  const playBtn = page.querySelector<HTMLButtonElement>("[data-video-play]");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  if (video) {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const lean = conn?.saveData === true || matchMedia("(prefers-reduced-data: reduce)").matches;
    const auto = () => !still.matches && !lean;
    // A pause we didn't cause (the visitor's) stops the in-view autoplay for good.
    let touched = false;
    let ours = false;
    const syncBtn = () => {
      if (playBtn) playBtn.hidden = auto() || !video.paused || video.currentTime > 0;
    };
    syncBtn();
    still.addEventListener("change", syncBtn);
    playBtn?.addEventListener("click", () => {
      touched = true;
      void video.play().catch(() => {});
      video.focus();
    });
    video.addEventListener("play", syncBtn);
    video.addEventListener("pause", () => {
      if (ours) ours = false;
      else touched = true;
    });
    new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (e.isIntersecting && auto() && !touched) {
          video.loop = true;
          void video.play().catch(() => {
            if (playBtn) playBtn.hidden = false;
          });
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
  if (!still.matches) {
    const hero = page.querySelector<HTMLElement>("[data-hero-a]");
    if (hero) void import("./hero-a").then((m) => m.default(hero));
    if (load) void load().then((m) => m.default(page));
    // Highlights: the step loop. With reduced motion the static drawing stays, as without JS.
    if (page.querySelector(".hl-fig")) void import("./flow").then((m) => m.default(page));
  }
}
