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
