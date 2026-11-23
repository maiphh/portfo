/**
 * Floating project preview near the cursor for Selected Work rows.
 * Pointer-fine + hover only; does not block clicks; clamped to the viewport.
 * Keyboard focus optionally shows the card anchored to the row.
 */
import { gsap } from "gsap";
import { reduce } from "./dom";

type PreviewData = {
  title: string;
  summary: string;
  tags: string[];
  image?: string;
};

const CARD_W = 280;
const CARD_H_FALLBACK = 200;
const OFFSET = 18;

function parsePreview(raw: string | undefined): PreviewData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PreviewData;
    if (!data?.title) return null;
    return {
      title: data.title,
      summary: data.summary ?? "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      image: data.image || undefined,
    };
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Build the card once; pointer-events none so links stay clickable. */
function ensureCard(): HTMLElement {
  let card = document.getElementById("sw-preview");
  if (card) return card;
  card = document.createElement("aside");
  card.id = "sw-preview";
  card.className = "sw-preview";
  card.setAttribute("aria-hidden", "true");
  card.innerHTML = `
    <div class="sw-preview-media" hidden></div>
    <div class="sw-preview-body">
      <p class="sw-preview-title"></p>
      <p class="sw-preview-summary"></p>
      <ul class="sw-preview-tags"></ul>
    </div>
  `;
  document.body.append(card);
  gsap.set(card, { autoAlpha: 0, scale: 0.92, x: 0, y: 0 });
  return card;
}

function fillCard(card: HTMLElement, data: PreviewData) {
  const title = card.querySelector(".sw-preview-title");
  const summary = card.querySelector(".sw-preview-summary");
  const tags = card.querySelector(".sw-preview-tags");
  const media = card.querySelector<HTMLElement>(".sw-preview-media");
  if (title) title.textContent = data.title;
  if (summary) summary.textContent = data.summary;
  if (tags) {
    tags.replaceChildren(
      ...data.tags.slice(0, 4).map((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        return li;
      }),
    );
  }
  if (media) {
    media.replaceChildren();
    if (data.image) {
      const img = document.createElement("img");
      img.src = data.image;
      img.alt = "";
      img.decoding = "async";
      img.width = 280;
      img.height = 158;
      media.append(img);
      media.hidden = false;
    } else {
      media.hidden = true;
    }
  }
}

export function initWorkPreview(root: HTMLElement): () => void {
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  if (!fine.matches || reduce()) return () => {};

  const card = ensureCard();
  const moveX = gsap.quickTo(card, "x", { duration: 0.35, ease: "power3.out" });
  const moveY = gsap.quickTo(card, "y", { duration: 0.35, ease: "power3.out" });
  let visible = false;
  let active: HTMLElement | null = null;
  const listeners = new AbortController();
  const { signal } = listeners;

  const place = (clientX: number, clientY: number, anchor?: DOMRect) => {
    const cw = card.offsetWidth || CARD_W;
    const ch = card.offsetHeight || CARD_H_FALLBACK;
    const pad = 12;
    let x: number;
    let y: number;
    if (anchor) {
      x = clamp(anchor.left, pad, innerWidth - cw - pad);
      y = clamp(anchor.bottom + 8, pad, innerHeight - ch - pad);
    } else {
      x = clientX + OFFSET;
      y = clientY + OFFSET;
      if (x + cw > innerWidth - pad) x = clientX - cw - OFFSET;
      if (y + ch > innerHeight - pad) y = clientY - ch - OFFSET;
      x = clamp(x, pad, innerWidth - cw - pad);
      y = clamp(y, pad, innerHeight - ch - pad);
    }
    moveX(x);
    moveY(y);
  };

  const show = (data: PreviewData, clientX: number, clientY: number, anchor?: DOMRect) => {
    fillCard(card, data);
    if (!visible) {
      visible = true;
      // Seed position before fade-in so quickTo does not lerp from 0,0.
      if (anchor) {
        gsap.set(card, {
          x: clamp(anchor.left, 12, innerWidth - (card.offsetWidth || CARD_W) - 12),
          y: clamp(
            anchor.bottom + 8,
            12,
            innerHeight - (card.offsetHeight || CARD_H_FALLBACK) - 12,
          ),
        });
      } else {
        gsap.set(card, { x: clientX + OFFSET, y: clientY + OFFSET });
      }
      gsap.to(card, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.28,
        ease: "power3.out",
        overwrite: "auto",
      });
    }
    place(clientX, clientY, anchor);
  };

  const hide = () => {
    if (!visible) return;
    visible = false;
    active = null;
    gsap.to(card, {
      autoAlpha: 0,
      scale: 0.92,
      duration: 0.2,
      ease: "power2.in",
      overwrite: "auto",
    });
  };

  const rows = [...root.querySelectorAll<HTMLElement>("[data-sw-preview]")];
  for (const row of rows) {
    row.addEventListener(
      "pointerenter",
      (e) => {
        if (e.pointerType !== "mouse") return;
        const data = parsePreview(row.dataset.swPreview);
        if (!data) return;
        active = row;
        show(data, e.clientX, e.clientY);
      },
      { signal },
    );
    row.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse" || active !== row || !visible) return;
        place(e.clientX, e.clientY);
      },
      { signal },
    );
    row.addEventListener(
      "pointerleave",
      (e) => {
        if (e.pointerType !== "mouse") return;
        if (active === row) hide();
      },
      { signal },
    );
    row.addEventListener(
      "focus",
      () => {
        const data = parsePreview(row.dataset.swPreview);
        if (!data) return;
        active = row;
        const r = row.getBoundingClientRect();
        show(data, r.left, r.bottom, r);
      },
      { signal },
    );
    row.addEventListener(
      "blur",
      () => {
        if (active === row) hide();
      },
      { signal },
    );
  }

  const onFineChange = () => {
    if (!fine.matches) hide();
  };
  fine.addEventListener("change", onFineChange, { signal });

  return () => {
    listeners.abort();
    hide();
    card.remove();
  };
}
