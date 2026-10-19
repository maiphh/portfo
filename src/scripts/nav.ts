/**
 * Mobile menu (<details class="menu">). Without JS it still opens and closes via
 * <summary>; with JS it also closes on a link tap, an outside tap, Escape (focus
 * returns to the toggle), scrolling away, and focus leaving the menu.
 */
export function initMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>("details.menu");
  const summary = menu?.querySelector<HTMLElement>("summary");
  if (!menu || !summary) return;

  let openedAt = 0;
  const close = (refocus = false) => {
    if (!menu.open) return;
    menu.open = false;
    if (refocus) summary.focus();
  };

  menu.addEventListener("toggle", () => {
    if (menu.open) openedAt = window.scrollY;
  });
  menu.addEventListener("click", (e) => {
    if ((e.target as Element | null)?.closest("a")) close();
  });
  document.addEventListener("pointerdown", (e) => {
    if (menu.open && !menu.contains(e.target as Node)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.open) {
      e.preventDefault();
      close(true);
    }
  });
  menu.addEventListener("focusout", (e) => {
    const next = e.relatedTarget as Node | null;
    if (menu.open && next && !menu.contains(next)) close();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (menu.open && Math.abs(window.scrollY - openedAt) > 32) close();
    },
    { passive: true },
  );
}
