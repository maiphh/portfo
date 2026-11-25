import { gsap } from "gsap";

export function initNav(): void {
  const nav = document.querySelector<HTMLElement>("header.nav");
  if (!nav) return;

  const disclosures = Array.from(nav.querySelectorAll<HTMLDetailsElement>("details"));
  const desktopItems = disclosures.filter((item) => item.name === "desktop-nav");
  const mobileMenu = nav.querySelector<HTMLDetailsElement>(".nav-mobile");
  const close = (item: HTMLDetailsElement) => {
    item.open = false;
    item.querySelectorAll("details[open]").forEach((child) => child.removeAttribute("open"));
  };

  initNavScroll(nav);

  desktopItems.forEach((item) => {
    item.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      const focused = desktopItems.some(
        (other) => other !== item && other.open && other.matches(":focus-within"),
      );
      if (!focused) item.open = true;
    });
    item.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && !item.matches(":focus-within")) close(item);
    });
  });

  disclosures.forEach((item) => {
    const focusScope = mobileMenu?.contains(item) ? mobileMenu : item;
    item.addEventListener("focusout", (event) => {
      const next = event.relatedTarget as Node | null;
      if (next && !focusScope.contains(next)) close(item);
    });
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (mobileMenu?.contains(target)) return;
    disclosures.forEach((item) => {
      if (item.open && !item.contains(target)) close(item);
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const open = disclosures.filter((item) => item.open && item.getClientRects().length);
    const item = open.findLast((candidate) => candidate.matches(":focus-within")) ?? open.at(-1);
    if (!item) return;
    event.preventDefault();
    const restoreFocus = nav.contains(document.activeElement);
    close(item);
    if (restoreFocus) item.querySelector("summary")?.focus();
  });
  nav.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) disclosures.forEach(close);
  });

  if (mobileMenu) {
    let openedAt = 0;
    mobileMenu.addEventListener("toggle", () => {
      if (mobileMenu.open) openedAt = window.scrollY;
    });
    window.addEventListener(
      "scroll",
      () => {
        if (mobileMenu.open && Math.abs(window.scrollY - openedAt) > 32) close(mobileMenu);
      },
      { passive: true },
    );
  }

  if (!nav.hasAttribute("data-home-nav")) return;
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>("[data-nav-section]"));
  const sections = Array.from(new Set(links.map((link) => link.dataset.navSection)))
    .map((id) => document.getElementById(id ?? ""))
    .filter((section): section is HTMLElement => section !== null);
  const first = sections[0];
  if (!first) return;

  let frame = 0;
  let current = "";
  let offset = 0;
  const update = () => {
    frame = 0;
    const pastBoundary = first.getBoundingClientRect().top <= offset + 1;
    if (!pastBoundary && nav.hasAttribute("data-nav-visible")) disclosures.forEach(close);
    nav.toggleAttribute("data-nav-visible", pastBoundary);

    const active = pastBoundary
      ? (sections.findLast((section) => section.getBoundingClientRect().top <= offset + 1)?.id ??
        "")
      : "";
    if (active === current) return;
    current = active;
    links.forEach((link) => {
      if (link.dataset.navSection === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  const scheduleUpdate = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const resize = () => {
    offset =
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || nav.offsetHeight;
    scheduleUpdate();
  };

  nav.setAttribute("data-nav-ready", "");
  resize();
  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("pageshow", (event) => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    // The browser can miss the initial fragment while the header moves out of flow.
    if (!event.persisted && navigation?.type === "navigate" && window.scrollY === 0) {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target && sections.some((section) => section.contains(target))) target.scrollIntoView();
    }
    scheduleUpdate();
  });
  window.addEventListener("resize", resize);
  new ResizeObserver(scheduleUpdate).observe(document.querySelector("[data-hero]") ?? first);
}

/**
 * Hide on scroll down, show on scroll up. Always visible near the top of the page
 * and when focus is inside the nav. Initial appear on load (or when the home nav
 * first crosses the hero boundary).
 */
function initNavScroll(nav: HTMLElement): void {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const home = nav.hasAttribute("data-home-nav");
  let hidden = false;
  let lastY = window.scrollY;
  let ticking = 0;
  let appeared = false;
  // Hash jumps and first paint fire scroll events; ignore hide until the page settles.
  let armed = false;
  const delta = 8;
  window.setTimeout(() => {
    armed = true;
    lastY = window.scrollY;
  }, 700);

  const canHide = () => {
    if (!armed) return false;
    if (reduce.matches) return false;
    if (nav.matches(":focus-within")) return false;
    if (nav.querySelector("details[open]")) return false;
    // Home: stay fully managed by data-nav-visible until past the hero.
    if (home && !nav.hasAttribute("data-nav-visible")) return false;
    return window.scrollY > 24;
  };

  // Animate `top` (not transform) so position:sticky on case pages keeps working.
  const hideTop = () => -(nav.offsetHeight || 69) - 4;

  const setHidden = (next: boolean) => {
    if (hidden === next) return;
    hidden = next;
    nav.toggleAttribute("data-nav-away", next);
    gsap.to(nav, {
      top: next ? hideTop() : 0,
      duration: next ? 0.28 : 0.35,
      ease: next ? "power2.in" : "power3.out",
      overwrite: "auto",
    });
  };

  const appear = () => {
    if (appeared) return;
    appeared = true;
    if (reduce.matches) {
      gsap.set(nav, { top: 0 });
      return;
    }
    // Animate `top` only — never autoAlpha/visibility, which would override the
    // home nav's CSS `visibility: hidden` while still above the hero.
    gsap.fromTo(
      nav,
      { top: -28 },
      { top: 0, duration: 0.55, ease: "power3.out", overwrite: "auto" },
    );
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = requestAnimationFrame(() => {
      ticking = 0;
      const y = window.scrollY;
      if (home && nav.hasAttribute("data-nav-visible") && !appeared) appear();
      if (!home && !appeared) appear();

      if (!canHide()) {
        setHidden(false);
        lastY = y;
        return;
      }
      const dy = y - lastY;
      if (Math.abs(dy) < delta) return;
      setHidden(dy > 0);
      lastY = y;
    });
  };

  // Non-home pages: nav is visible from the first paint — play the appear.
  if (!home) appear();
  else gsap.set(nav, { top: 0 });

  window.addEventListener("scroll", onScroll, { passive: true });
  nav.addEventListener("focusin", () => setHidden(false));
  // In-nav clicks (hash jumps) scroll the page; keep the bar out until that settles.
  let settleTimer = 0;
  nav.addEventListener("click", () => {
    setHidden(false);
    armed = false;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      armed = true;
      lastY = window.scrollY;
    }, 800);
  });
  // Peek the bar when the pointer reaches the top edge (common hide-on-scroll UX).
  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "mouse" && e.clientY < 56) setHidden(false);
    },
    { passive: true },
  );
  reduce.addEventListener("change", () => {
    if (reduce.matches) {
      setHidden(false);
      gsap.set(nav, { top: 0, clearProps: "top" });
    }
  });

  // When the home nav flips to visible, run the appear once.
  if (home) {
    const mo = new MutationObserver(() => {
      if (nav.hasAttribute("data-nav-visible") && !appeared) appear();
      if (!nav.hasAttribute("data-nav-visible")) {
        setHidden(false);
        gsap.set(nav, { top: 0 });
      }
    });
    mo.observe(nav, { attributes: true, attributeFilter: ["data-nav-visible"] });
  }
}
