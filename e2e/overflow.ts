/**
 * Everything inside `selector` that pokes out of it or the viewport, scrolls sideways, has a
 * clamped flow label, or sets text under 12px. Runs in the page (page.evaluate).
 */
export function overflowReport(selector: string) {
  const sec = document.querySelector<HTMLElement>(selector);
  if (!sec) return [`no ${selector}`];
  const S = sec.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const right = Math.min(S.right, vw) + 0.5;
  const left = Math.max(S.left, 0) - 0.5;
  const out: string[] = [];
  const shown = (el: Element) =>
    el.getClientRects().length > 0 &&
    !el.closest("[hidden], .sr-only") &&
    // Deliberate horizontal scrollers (e.g. the case-study rail) and their contents.
    !el.parentElement?.closest("[data-scroll-x]") &&
    getComputedStyle(el).visibility !== "hidden";
  const name = (el: Element) =>
    `${el.tagName.toLowerCase()}${el.getAttribute("class") ? "." + el.getAttribute("class")?.replace(/\s+/g, ".") : ""} "${(el.textContent ?? "").trim().slice(0, 32)}"`;

  if (sec.scrollWidth > sec.clientWidth)
    out.push(`section scrollWidth ${sec.scrollWidth} > ${sec.clientWidth}`);
  if (document.documentElement.scrollWidth > vw)
    out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  for (const el of sec.querySelectorAll("*")) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > right || r.left < left)
      out.push(
        `${name(el)} spans ${Math.round(r.left)}–${Math.round(r.right)}, section ${Math.round(left)}–${Math.round(right)}`,
      );
    if (
      el instanceof HTMLElement &&
      !el.hasAttribute("data-scroll-x") &&
      el.clientWidth > 0 &&
      el.scrollWidth > el.clientWidth + 1
    )
      out.push(`${name(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
  }
  // Labels clamp at two lines; authored labels must fit without being cut.
  for (const el of sec.querySelectorAll(".flow-node .t, .flow-node .s")) {
    if (shown(el) && el.scrollHeight > el.clientHeight + 1)
      out.push(`${name(el)} is clamped (${el.scrollHeight} > ${el.clientHeight})`);
  }
  // Text stays at 12px or more.
  for (const el of sec.querySelectorAll("*")) {
    if (!shown(el) || !(el.firstChild?.nodeType === Node.TEXT_NODE)) continue;
    if (!(el.textContent ?? "").trim()) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 12) out.push(`${name(el)} is ${size}px`);
  }
  return out;
}
