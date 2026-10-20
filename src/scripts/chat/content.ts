/**
 * Where the page's real content is: lines of text, tap targets and media. The launcher and
 * the roaming mascot use it to never rest on (or perch over) anything readable or pressable.
 * Text that is invisible right now still counts: scroll reveals fade it in a moment later.
 */
import type { Box } from "~/lib/chat/geometry";

const TARGETS = "a[href],button,input,select,textarea,summary,[role=button]";
const MEDIA = "img,video,iframe,canvas,svg[role=img]";

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
