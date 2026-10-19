export const $ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document): T | null =>
  c.querySelector<T>(s);
export const $$ = <T extends Element = HTMLElement>(s: string, c: ParentNode = document): T[] =>
  Array.from(c.querySelectorAll<T>(s));
export const fmt = (n: number, d = 0) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const esc = (s: string) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
export const clock = () => {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((x) => String(x).padStart(2, "0"))
    .join(":");
};
export const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
export const reduce = () => mqReduce.matches;

/** Position of el relative to an ancestor, from offsets (unaffected by transforms). */
export function relRect(el: HTMLElement, anc: HTMLElement) {
  let x = 0;
  let y = 0;
  let e: HTMLElement | null = el;
  while (e && e !== anc) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}
