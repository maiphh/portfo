/**
 * Plate label layout, run in the page: for every plate in #deep-dives, every mode and every story
 * step, the shown labels must not overlap each other (beyond `tol` px) and must stay inside the plate's
 * drawing frame (the shown `.stage`): their text at least `edge` px in from its border.
 * Drives the plate's own controls, so it needs JS and reduced motion (steps apply at once).
 */
export function labelLayout([tol, edge]: [number, number]) {
  const out: string[] = [];
  const shown = (el: Element) =>
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden" &&
    Number(getComputedStyle(el).opacity) > 0;
  const name = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const textBox = (el: Element) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rg = document.createRange();
    const b = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) {
        b.left = Math.min(b.left, q.left);
        b.top = Math.min(b.top, q.top);
        b.right = Math.max(b.right, q.right);
        b.bottom = Math.max(b.bottom, q.bottom);
      }
    }
    return b;
  };
  const check = (P: HTMLElement, where: string) => {
    const st = [...P.querySelectorAll(".stage")].find(shown);
    if (!st) return;
    const pr = st.getBoundingClientRect();
    const lbs = [...st.querySelectorAll(".lb")]
      .filter(shown)
      .map((l) => ({ l, r: l.getBoundingClientRect() }));
    lbs.forEach(({ l, r }, i) => {
      // the frame check uses the text's own extent: a wrapped phone chip's box keeps its max-width
      const t = textBox(l);
      const gap = Math.min(
        t.left - pr.left,
        pr.right - t.right,
        t.top - pr.top,
        pr.bottom - t.bottom,
      );
      if (gap < edge) out.push(`${where}: "${name(l)}" is ${gap | 0}px from the frame edge`);
      for (const { l: m, r: q } of lbs.slice(i + 1)) {
        const ox = Math.min(r.right, q.right) - Math.max(r.left, q.left);
        const oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        if (ox > tol && oy > tol)
          out.push(`${where}: "${name(l)}" overlaps "${name(m)}" (${ox | 0}×${oy | 0})`);
      }
    });
  };
  const plates = [...document.querySelectorAll<HTMLElement>("#deep-dives .plate")];
  plates.forEach((P, pi) => {
    const box = P.closest("article") ?? P;
    const id = `${pi + 1}`;
    const prev = box.querySelector<HTMLButtonElement>("[data-step='-1']");
    const modes = [...box.querySelectorAll<HTMLButtonElement>("button[data-mode]")];
    const N = JSON.parse(P.dataset.n ?? "{}") as Record<string, number>;
    const mode0 = P.dataset.mode;
    const runs: (HTMLButtonElement | null)[] = modes.length ? modes : [null];
    for (const m of runs) {
      m?.click();
      const mode = P.dataset.mode ?? "d";
      const n = N[mode] ?? 1;
      for (let s = n - 1; s >= 0; s--) {
        check(P, `plate ${id} ${mode} step ${s + 1}/${n}`);
        prev?.click();
      }
      // back to the end state for the next mode
      for (let s = 0; s < n; s++) box.querySelector<HTMLButtonElement>("[data-step='1']")?.click();
    }
    // leave the default mode selected
    modes.find((b) => b.dataset.mode === mode0)?.click();
  });
  return out;
}
