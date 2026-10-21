/**
 * Behaviour for <FlowDiagram> (components/flow/FlowDiagram.astro). Per flow:
 * - picks the layout (grid with edges, or a list) from the container width;
 * - draws the edges from the node boxes, again on every resize;
 * - opens a node's details below the flow (grid) or in a bottom sheet (list), keeps the
 *   selection when the layout flips, and returns focus to the node on close;
 * - arrow keys / Home / End move between nodes, Esc closes;
 * - motion (edges drawing in once, the home page's packets) only without reduced motion.
 */
import { edgeGeom, listBelow, type Box } from "~/lib/flow/geometry";

const NS = "http://www.w3.org/2000/svg";
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

function must<T>(v: T | null | undefined, what: string): T {
  if (v == null) throw new Error(`[flow] missing ${what}`);
  return v;
}

function init(block: HTMLElement) {
  const flow = must(block.querySelector<HTMLElement>("[data-flow]"), "[data-flow]");
  const svg = must(block.querySelector<SVGSVGElement>("[data-flow-edges]"), "[data-flow-edges]");
  const region = must(block.querySelector<HTMLElement>("[data-flow-detail]"), "[data-flow-detail]");
  const hint = must(block.querySelector<HTMLElement>("[data-flow-hint]"), "[data-flow-hint]");
  const all = must(block.querySelector<HTMLElement>("[data-flow-all]"), "[data-flow-all]");
  const sheet = must(
    block.querySelector<HTMLDialogElement>("[data-flow-sheet]"),
    "[data-flow-sheet]",
  );
  const sheetBody = must(
    block.querySelector<HTMLElement>("[data-flow-sheet-body]"),
    "[data-flow-sheet-body]",
  );
  const id = must(flow.dataset.flow, "data-flow");
  const cols = Number(flow.dataset.cols);
  const edges = JSON.parse(must(flow.dataset.edges, "data-edges")) as [string, string, string?][];
  const groups = JSON.parse(flow.dataset.groups ?? "{}") as Record<string, string>;
  const packets = flow.hasAttribute("data-packets");
  const nodes = [...flow.querySelectorAll<HTMLButtonElement>("[data-node]")];
  const node = (nid: string) =>
    must(
      nodes.find((n) => n.dataset.node === nid),
      `node ${nid}`,
    );

  let current: string | null = null;
  let drawnIn = false;
  let inView = false;

  block.classList.add("is-enhanced");
  flow.classList.add("is-js");
  hint.hidden = false;

  const isList = () => flow.classList.contains("is-list");

  /** Returns true when the layout flipped. */
  function setMode(): boolean {
    const was = isList();
    flow.classList.toggle("is-list", flow.clientWidth < listBelow(cols));
    return was !== isList();
  }

  function boxOf(el: Element, origin: DOMRect): Box {
    const r = el.getBoundingClientRect();
    return {
      left: r.left - origin.left,
      top: r.top - origin.top,
      right: r.right - origin.left,
      bottom: r.bottom - origin.top,
    };
  }

  function draw() {
    svg.replaceChildren();
    for (const g of flow.querySelectorAll(".flow-groupbox")) g.remove();
    if (isList()) return;
    const origin = flow.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${origin.width} ${origin.height}`);
    for (const [gid, gl] of Object.entries(groups)) {
      const boxes = nodes
        .filter((n) => n.closest("li")?.dataset.group === gid)
        .map((n) => boxOf(n, origin));
      if (!boxes.length) continue;
      const L = Math.min(...boxes.map((b) => b.left)) - 12;
      const T = Math.min(...boxes.map((b) => b.top)) - 18;
      const R = Math.max(...boxes.map((b) => b.right)) + 12;
      const B = Math.max(...boxes.map((b) => b.bottom)) + 12;
      const box = document.createElement("div");
      box.className = "flow-groupbox";
      box.setAttribute("aria-hidden", "true");
      Object.assign(box.style, {
        left: `${L}px`,
        top: `${T}px`,
        width: `${R - L}px`,
        height: `${B - T}px`,
      });
      const label = document.createElement("span");
      label.textContent = gl;
      box.append(label);
      flow.prepend(box);
    }
    edges.forEach(([a, b, style], i) => {
      const g = edgeGeom(boxOf(node(a), origin), boxOf(node(b), origin));
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", g.d);
      if (style && style !== "solid") p.classList.add(style);
      p.id = `${id}-e${i}`;
      p.dataset.a = a;
      p.dataset.b = b;
      svg.append(p);
    });
    if (packets && !reduce.matches) {
      edges.forEach((_, i) => {
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("r", "4");
        c.setAttribute("class", "pk");
        c.setAttribute("cx", "0");
        c.setAttribute("cy", "0");
        const m = document.createElementNS(NS, "animateMotion");
        m.setAttribute("dur", "2.6s");
        m.setAttribute("begin", `${(i * 0.41) % 2.6}s`);
        m.setAttribute("repeatCount", "indefinite");
        const mp = document.createElementNS(NS, "mpath");
        mp.setAttribute("href", `#${id}-e${i}`);
        m.append(mp);
        c.append(m);
        svg.append(c);
      });
      if (!inView) svg.pauseAnimations();
    }
    mark();
  }

  /** Draws the edges in, once, the first time the flow is seen. */
  function drawIn() {
    if (drawnIn || reduce.matches || isList()) return;
    drawnIn = true;
    nodes.forEach((n, i) =>
      n.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 500,
        delay: i * 60,
        fill: "backwards",
      }),
    );
    svg.querySelectorAll("path").forEach((p, i) => {
      if (p.classList.contains("dashed") || p.classList.contains("dotted")) return;
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
        duration: 1000,
        delay: i * 70,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "backwards",
      }).finished.then(
        () => (p.style.strokeDasharray = ""),
        () => (p.style.strokeDasharray = ""),
      );
    });
  }

  function mark() {
    for (const n of nodes) n.setAttribute("aria-expanded", String(n.dataset.node === current));
    for (const p of svg.querySelectorAll<SVGPathElement>("path")) {
      const on = current !== null && (p.dataset.a === current || p.dataset.b === current);
      p.classList.toggle("on", on);
      p.classList.toggle("dim", current !== null && !on);
    }
  }

  function render(nid: string, into: HTMLElement, headingId: string) {
    const src = must(all.querySelector<HTMLElement>(`[data-detail="${nid}"]`), "detail");
    const copy = src.cloneNode(true) as HTMLElement;
    must(copy.querySelector("h3"), "h3").id = headingId;
    must(copy.querySelector<HTMLElement>("[data-flow-close]"), "[data-flow-close]").hidden = false;
    into.replaceChildren(copy);
  }

  function open(nid: string, focusClose = false) {
    current = nid;
    const btn = node(nid);
    if (isList()) {
      region.dataset.state = "empty";
      region.replaceChildren(hint, all);
      render(nid, sheetBody, `${id}-sheet-h`);
      for (const n of nodes) n.setAttribute("aria-controls", sheet.id);
      if (!sheet.open) sheet.showModal();
      sheet.scrollTop = 0;
      must(sheet.querySelector<HTMLElement>("[data-flow-close]"), "[data-flow-close]").focus();
      // Keep the opened row visible above the sheet.
      requestAnimationFrame(() => {
        const r = btn.getBoundingClientRect();
        const top = innerHeight - sheet.getBoundingClientRect().height;
        // Below the sticky site header, if there is one.
        const head = document.querySelector("header.nav")?.getBoundingClientRect();
        const min = head && head.top <= 0 && head.bottom > 0 ? head.bottom : 0;
        if (r.bottom > top - 8 || r.top < min)
          scrollBy({
            top: r.top - Math.max(min + 8, (min + top - r.height) / 2),
            behavior: "instant",
          });
      });
    } else {
      if (sheet.open) sheet.close();
      for (const n of nodes) n.setAttribute("aria-controls", region.id);
      region.dataset.state = "open";
      hint.hidden = true;
      render(nid, region, `${id}-detail-h`);
      region.append(all);
      region.setAttribute("aria-labelledby", `${id}-detail-h`);
      if (focusClose)
        must(region.querySelector<HTMLElement>("[data-flow-close]"), "[data-flow-close]").focus();
    }
    mark();
    const on = [...svg.querySelectorAll<SVGPathElement>("path.on")];
    block.dispatchEvent(
      new CustomEvent("flow:select", { detail: { id: nid, node: btn, edges: on } }),
    );
  }

  function close() {
    if (current === null) return;
    const btn = node(current);
    current = null;
    if (sheet.open) sheet.close();
    sheetBody.replaceChildren();
    region.dataset.state = "empty";
    region.removeAttribute("aria-labelledby");
    hint.hidden = false;
    region.replaceChildren(hint, all);
    mark();
    btn.focus();
    block.dispatchEvent(new CustomEvent("flow:close", { detail: { id: btn.dataset.node } }));
  }

  flow.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-node]");
    if (!btn) return;
    if (current === btn.dataset.node && !isList()) close();
    else if (btn.dataset.node) open(btn.dataset.node);
  });
  block.addEventListener("click", (e) => {
    if ((e.target as Element).closest("[data-flow-close]")) close();
  });
  // A tap on the scrim (the dialog itself, outside its content) closes the sheet.
  sheet.addEventListener("click", (e) => {
    if (e.target !== sheet) return;
    const r = sheet.getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) close();
  });
  sheet.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  block.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current !== null && !sheet.open) {
      e.preventDefault();
      close();
      return;
    }
    const at = nodes.indexOf(e.target as HTMLButtonElement);
    if (at < 0) return;
    const to =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? (at + 1) % nodes.length
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? (at - 1 + nodes.length) % nodes.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? nodes.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    nodes[to]?.focus();
  });

  function layout() {
    const flipped = setMode();
    draw();
    if (flipped && current !== null) {
      const was = current;
      const hadFocus =
        sheet.contains(document.activeElement) || region.contains(document.activeElement);
      open(was, hadFocus);
    }
    if (inView) drawIn();
  }

  setMode();
  draw();
  new ResizeObserver(() => requestAnimationFrame(layout)).observe(flow);
  document.fonts?.ready.then(() => requestAnimationFrame(layout));
  new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.isIntersecting);
      if (inView) {
        drawIn();
        svg.unpauseAnimations();
      } else svg.pauseAnimations();
    },
    { threshold: 0.2 },
  ).observe(flow);
  reduce.addEventListener("change", () => {
    drawnIn = drawnIn || reduce.matches;
    draw();
  });
}

for (const block of document.querySelectorAll<HTMLElement>("[data-flow-block]")) init(block);
