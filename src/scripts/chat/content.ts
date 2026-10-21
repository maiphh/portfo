/**
 * Where the page's real content is: lines of text, tap targets and media. The launcher and
 * the roaming mascot use it to never rest on (or perch over) anything readable or pressable.
 * Text that is invisible right now still counts: scroll reveals fade it in a moment later.
 * Open overlays marked `data-mascot-avoid` (a FlowDiagram details panel or sheet) count as one
 * solid box, empty corners included.
 */
import type { Box } from "~/lib/chat/geometry";

const TARGETS = "a[href],button,input,select,textarea,summary,[role=button]";
const MEDIA = "img,video,iframe,canvas,svg[role=img]";
/** Panels that count as content edge to edge while they are open. */
export const AVOID = "[data-mascot-avoid]";

const touches = (r: DOMRect | Box, region: Box) =>
  r.right - r.left > 0 &&
  r.bottom - r.top > 0 &&
  r.left < region.right &&
  r.right > region.left &&
  r.top < region.bottom &&
  r.bottom > region.top;

const toBox = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

/**
 * Content boxes (viewport coordinates) that intersect `region`. Stops after `limit` hits.
 * Elements inside `exclude` (the chat and mascot) are ignored.
 */
export function contentRects(region: Box, exclude: Element, limit = Infinity): Box[] {
  const out: Box[] = [];
  const add = (r: DOMRect) => {
    if (touches(r, region)) out.push(toBox(r));
    return out.length >= limit;
  };
  for (const r of avoidRects())
    if (touches(r, region) && (out.push(r), out.length >= limit)) return out;
  for (const el of document.querySelectorAll(TARGETS))
    if (!exclude.contains(el) && add(el.getBoundingClientRect())) return out;
  for (const el of document.querySelectorAll(MEDIA))
    if (
      !exclude.contains(el) &&
      !el.closest("[aria-hidden=true]") &&
      add(el.getBoundingClientRect())
    )
      return out;

  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.textContent?.trim() && !exclude.contains(n)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const range = document.createRange();
  let lastParent: Element | null = null;
  let parentNear = false;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const parent = n.parentElement;
    if (!parent) continue;
    if (parent !== lastParent) {
      lastParent = parent;
      // Cheap reject: the parent's box (inline or block) doesn't reach the region.
      parentNear = touches(parent.getBoundingClientRect(), region);
    }
    if (!parentNear) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (add(r)) return out;
  }
  return out;
}

/** True when any content sits within `pad` px of the spot. */
export function coversContent(spot: Box, exclude: Element, pad = 6): boolean {
  const region = {
    left: spot.left - pad,
    top: spot.top - pad,
    right: spot.right + pad,
    bottom: spot.bottom + pad,
  };
  return contentRects(region, exclude, 1).length > 0;
}

/** Boxes (viewport coordinates) of the open panels marked `data-mascot-avoid`. */
export function avoidRects(): Box[] {
  const out: Box[] = [];
  for (const el of document.querySelectorAll(AVOID)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push(toBox(r));
  }
  return out;
}

/** True when `box` overlaps an open `data-mascot-avoid` panel (within `pad` px). */
export function hitsPanel(box: Box, pad = 6): boolean {
  const region = {
    left: box.left - pad,
    top: box.top - pad,
    right: box.right + pad,
    bottom: box.bottom + pad,
  };
  return avoidRects().some((r) => touches(r, region));
}
