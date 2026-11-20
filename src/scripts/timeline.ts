/** Experience timeline: the old notes row lives in a card revealed on hover, focus or tap. */
const tl = document.querySelector<HTMLElement>("[data-tl]");
const modal = document.querySelector<HTMLElement>("[data-tl-modal]");
const close = document.querySelector<HTMLButtonElement>("[data-tl-close]");
const lead = document.querySelector<HTMLElement>("[data-tl-modal-lead]");
const text = document.querySelector<HTMLElement>("[data-tl-modal-text]");

export function initTimelineNotes(): void {
  if (!tl || !modal || !close || !lead || !text) return;
  const entries = Array.from(tl.querySelectorAll<HTMLElement>("[data-note-id]"));
  if (!entries.length) return;

  let current: HTMLElement | null = null;
  let pinned = false;

  const place = (entry: HTMLElement) => {
    // Phones use a fixed sheet (see global.css); the wide grid floats the card by the entry.
    if (window.matchMedia("(max-width: 899px)").matches) {
      modal.style.removeProperty("left");
      modal.style.removeProperty("top");
      return;
    }
    const r = entry.getBoundingClientRect();
    const box = tl.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left - box.left, box.width - modal.offsetWidth - 8));
    const below = r.bottom - box.top + 12;
    const above = r.top - box.top - modal.offsetHeight - 12;
    const top = below + modal.offsetHeight > box.height ? Math.max(8, above) : below;
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
  };

  const show = (entry: HTMLElement) => {
    current = entry;
    lead.textContent = entry.dataset.noteLead ?? "";
    text.textContent = entry.dataset.noteText ?? "";
    modal.hidden = false;
    place(entry);
  };

  const hide = () => {
    modal.hidden = true;
  };

  const toggle = (entry: HTMLElement) => {
    if (pinned && current === entry) {
      pinned = false;
      hide();
      return;
    }
    pinned = true;
    show(entry);
  };

  for (const entry of entries) {
    entry.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse" && !pinned) show(entry);
    });
    entry.addEventListener("pointerleave", (e) => {
      if (pinned || e.pointerType !== "mouse") return;
      if (e.relatedTarget instanceof Node && modal.contains(e.relatedTarget)) return;
      hide();
    });
    entry.addEventListener("focus", () => {
      if (!pinned) show(entry);
    });
    entry.addEventListener("blur", () => {
      if (!pinned) hide();
    });
    entry.addEventListener("click", (e) => {
      e.preventDefault();
      toggle(entry);
    });
    entry.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggle(entry);
    });
  }

  modal.addEventListener("pointerleave", (e) => {
    if (pinned || e.pointerType !== "mouse") return;
    hide();
  });
  close.addEventListener("click", () => {
    pinned = false;
    hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || modal.hidden) return;
    pinned = false;
    hide();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!pinned) return;
    const target = e.target as Element | null;
    if (modal.contains(e.target as Node) || target?.closest("[data-note-id]")) return;
    pinned = false;
    hide();
  });
  // Keep the floating card attached to its entry if the page moves under the pointer.
  window.addEventListener(
    "scroll",
    () => {
      if (!pinned && !modal.hidden && current) place(current);
    },
    { passive: true },
  );
}
