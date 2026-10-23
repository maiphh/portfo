/**
 * Behaviour for <FlowDiagram> (components/flow/FlowDiagram.astro). Per flow:
 * - picks the layout from the container width: the grid (`at`), or the phone/tablet lanes
 *   (`mAt`, or `mAt2` below the 3-lane width);
 * - draws the edges and group boxes from the node boxes in both, again on every resize;
 * - opens a node's details below the flow (grid) or in a bottom sheet (list), keeps the
 *   selection when the layout flips, and returns focus to the node on close;
 * - arrow keys / Home / End move between nodes, Esc closes;
 * - motion (edges drawing in once, the home page's packets) only without reduced motion;
 * - `autoplay` (opt-in): while nobody is using the flow, steps through the nodes in DOM
 *   (path) order and lights the edge into each one. Highlight only: no panel, sheet, focus,
 *   scrolling or aria change. Paused on hover, keyboard focus, touch, a selection, off screen
 *   or in a hidden tab; resumes RESUME ms after the person lets go. Off under reduced motion.
 */
import {
  crossedBoxes,
  edgeGeom,
  edgeGeomV,
  edgeGeomY,
  listBelow,
  pathPoints,
  type Box,
  type EdgeGeom,
} from "~/lib/flow/geometry";

const NS = "http://www.w3.org/2000/svg";
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
/** Autoplay: time on each node, the wait before the first step, and the idle time before resuming. */
const STEP = 2800;
const FIRST = 2000;
const RESUME = 6000;

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
  const list = must(flow.querySelector<HTMLElement>(".flow-nodes"), ".flow-nodes");
  const lanes = Number(flow.dataset.lanes ?? 1);
  const lanes3Min = Number(flow.dataset.lanes3Min ?? 0);
  const node = (nid: string) =>
    must(
      nodes.find((n) => n.dataset.node === nid),
      `node ${nid}`,
    );

  let current: string | null = null;
  let drawnIn = false;
  let inView = false;
  let auto: ReturnType<typeof autoplay> | null = null;

  block.classList.add("is-enhanced");
  flow.classList.add("is-js");
  hint.hidden = false;

  /** Phone/tablet lanes (details in the bottom sheet) rather than the grid. */
  const isList = () => flow.classList.contains("is-lanes");
  const isTwo = () => flow.classList.contains("is-2");

  /** Returns true when the layout flipped between grid and lanes. */
  function setMode(): boolean {
    const was = isList();
    const narrow = flow.clientWidth < listBelow(cols);
    flow.classList.toggle("is-lanes", narrow);
    flow.classList.toggle("is-2", narrow && lanes > 2 && flow.clientWidth < lanes3Min);
    // On a phone the whole card is content for the mascot (chat/content.ts): the docked
    // launcher tucks away rather than sit on the diagram's lanes, edges or gaps.
    flow.toggleAttribute("data-mascot-avoid", narrow);
    return was !== isList();
  }

  /** [row, lane] of a node's item in the current lane layout. */
  const cellOf = (li: HTMLElement): [number, number] => {
    const [r, l] = (isTwo() ? li.dataset.m2 : li.dataset.m)?.split(",").map(Number) ?? [1, 1];
    return [r ?? 1, l ?? 1];
  };

  /**
   * Lane edges that skip rows and would cross a node go round it: along the gutter beside the
   * target (different lanes), or the outer margin (same lane at the edge), else straight.
   */
  function laneRoutes(origin: DOMRect) {
    const cells = new Map<string, [number, number]>();
    const taken = new Set<string>();
    for (const n of nodes) {
      const c = cellOf(must(n.closest("li"), "li"));
      cells.set(must(n.dataset.node, "node id"), c);
      taken.add(c.join(","));
    }
    const widths = getComputedStyle(list).gridTemplateColumns.split(" ").map(parseFloat);
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    const L = list.getBoundingClientRect();
    const laneLeft = (k: number) =>
      L.left - origin.left + widths.slice(0, k - 1).reduce((s, w) => s + w + gap, 0);
    const laneRight = (k: number) => laneLeft(k) + (widths[k - 1] ?? 0);
    const between = (k: number) => laneRight(k) + gap / 2; // gutter between lanes k and k + 1
    const n = widths.length;
    const OUT = 9;
    return (a: string, b: string): number | undefined => {
      const [ra, la] = cells.get(a) ?? [1, 1];
      const [rb, lb] = cells.get(b) ?? [1, 1];
      if (Math.abs(ra - rb) < 2) return undefined;
      const [lo, hi] = [Math.min(la, lb), Math.max(la, lb)];
      let blocked = false;
      for (let r = Math.min(ra, rb) + 1; r < Math.max(ra, rb); r++)
        for (let l = lo; l <= hi; l++) if (taken.has(`${r},${l}`)) blocked = true;
      if (!blocked) return undefined;
      if (la === lb) {
        if (la === 1) return laneLeft(1) - OUT;
        if (la === n) return laneRight(n) + OUT;
        return between(la - 1);
      }
      return lb > la ? between(lb - 1) : between(lb);
    };
  }

  /**
   * Gutters of the node grid (either mode), in flow coordinates: x between columns/lanes and
   * just outside the first and last, y between rows (and outside them on the desktop grid).
   */
  function gutters(origin: DOMRect, lanesMode: boolean) {
    const cs = getComputedStyle(list);
    const L = list.getBoundingClientRect();
    const track = (tpl: string, gap: number, start: number, out: number, outEnd = out) => {
      const sizes = tpl
        .split(" ")
        .map(parseFloat)
        .filter((n) => !Number.isNaN(n));
      const at: number[] = [];
      let p = start;
      sizes.forEach((w, k) => {
        p += w;
        if (k < sizes.length - 1) at.push(p + gap / 2);
        p += gap;
      });
      return { inner: at, first: start - out, last: p - gap + outEnd };
    };
    const OUT = lanesMode ? 9 : 14;
    const xs = track(
      cs.gridTemplateColumns,
      parseFloat(cs.columnGap) || 0,
      L.left - origin.left,
      OUT,
    );
    // Below the last grid row, clear of a group box's bottom padding (12px).
    const ys = track(
      cs.gridTemplateRows,
      parseFloat(cs.rowGap) || 0,
      L.top - origin.top,
      OUT,
      lanesMode ? OUT : 24,
    );
    return {
      x: [...xs.inner, xs.first, xs.last],
      // Phone legends sit right above the lanes, so lanes only use the gaps between rows.
      y: lanesMode ? ys.inner : [...ys.inner, ys.first, ys.last],
    };
  }

  const lengthOf = (d: string) =>
    pathPoints(d).reduce(
      (s, p, k, ps) =>
        s + (k ? Math.hypot(p[0] - (ps[k - 1]?.[0] ?? 0), p[1] - (ps[k - 1]?.[1] ?? 0)) : 0),
      0,
    );

  /**
   * The edge's route: the direct one when it crosses no other node, else the shortest gutter
   * route (along a column gap or a row gap) that doesn't, else the direct one.
   */
  function route(
    A: Box,
    B: Box,
    others: Box[],
    frames: Box[],
    lanesMode: boolean,
    preferred: number | undefined,
    g: ReturnType<typeof gutters>,
  ): EdgeGeom {
    const direct = lanesMode ? edgeGeomV(A, B, preferred) : edgeGeom(A, B);
    if (!crossedBoxes(direct.d, others).length) return direct;
    // Grid gutters are as wide as a group box's padding, so a gutter's middle can sit right on
    // a group's dashed border: try either side of it too, and prefer routes clear of borders.
    const shifts = lanesMode ? [0] : [0, -3, 3, -7, 7, -11, 11];
    const tries: EdgeGeom[] = [
      ...g.x.flatMap((x) => shifts.map((s) => edgeGeomV(A, B, x + s))),
      ...g.y
        .flatMap((y) => shifts.map((s) => y + s))
        .filter((y) => !(y > A.top && y < A.bottom) && !(y > B.top && y < B.bottom))
        .map((y) => edgeGeomY(A, B, y)),
    ];
    const along = (d: string) =>
      pathPoints(d).filter(([x, y]) =>
        frames.some(
          (f) =>
            ((Math.abs(x - f.left) < 4.5 || Math.abs(x - f.right) < 4.5) &&
              y > f.top &&
              y < f.bottom) ||
            ((Math.abs(y - f.top) < 4.5 || Math.abs(y - f.bottom) < 4.5) &&
              x > f.left &&
              x < f.right),
        ),
      ).length;
    let best: { g: EdgeGeom; score: number } | null = null;
    for (const t of tries) {
      if (crossedBoxes(t.d, others).length) continue;
      const score = lengthOf(t.d) + 9 * along(t.d);
      if (!best || score < best.score) best = { g: t, score };
    }
    return best?.g ?? direct;
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

  /** Arrowhead markers (plain and lit), referenced from flow.css through --ah / --ah-on. */
  function arrowheads() {
    const defs = document.createElementNS(NS, "defs");
    for (const [suffix, cls] of [
      ["ah", "ah"],
      ["ah-on", "ah on"],
    ] as const) {
      const m = document.createElementNS(NS, "marker");
      m.id = `${id}-${suffix}`;
      m.setAttribute("viewBox", "0 0 8 8");
      m.setAttribute("refX", "7.5");
      m.setAttribute("refY", "4");
      m.setAttribute("markerWidth", "7");
      m.setAttribute("markerHeight", "7");
      m.setAttribute("markerUnits", "userSpaceOnUse");
      m.setAttribute("orient", "auto");
      const tip = document.createElementNS(NS, "polygon");
      tip.setAttribute("points", "0,0.5 8,4 0,7.5");
      tip.setAttribute("class", cls);
      m.append(tip);
      defs.append(m);
    }
    svg.append(defs);
    svg.style.setProperty("--ah", `url(#${id}-ah)`);
    svg.style.setProperty("--ah-on", `url(#${id}-ah-on)`);
  }

  function draw() {
    svg.replaceChildren();
    for (const g of flow.querySelectorAll(".flow-groupbox")) g.remove();
    const lanesMode = isList();
    const origin = flow.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${origin.width} ${origin.height}`);
    arrowheads();
    // Lanes sit closer together than grid columns, so their group boxes hug tighter.
    const [px, pt, pb] = lanesMode ? [3, 17, 6] : [12, 18, 12];
    const frames: Box[] = [];
    const labels: Box[] = [];
    for (const [gid, gl] of Object.entries(groups)) {
      const boxes = nodes
        .filter((n) => n.closest("li")?.dataset.group === gid)
        .map((n) => boxOf(n, origin));
      if (!boxes.length) continue;
      const L = Math.min(...boxes.map((b) => b.left)) - px;
      const T = Math.min(...boxes.map((b) => b.top)) - pt;
      const R = Math.max(...boxes.map((b) => b.right)) + px;
      const B = Math.max(...boxes.map((b) => b.bottom)) + pb;
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
      frames.push({ left: L, top: T, right: R, bottom: B });
      labels.push(boxOf(label, origin));
    }
    const via = lanesMode ? laneRoutes(origin) : () => undefined;
    const g0 = gutters(origin, lanesMode);
    const all = new Map(nodes.map((n) => [n.dataset.node ?? "", boxOf(n, origin)]));
    edges.forEach(([a, b, style], i) => {
      const A = must(all.get(a), a);
      const B = must(all.get(b), b);
      const others = [...[...all].filter(([k]) => k !== a && k !== b).map(([, v]) => v), ...labels];
      const g = route(A, B, others, frames, lanesMode, via(a, b), g0);
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
        // Hidden until its motion begins, so it never waits at the SVG's origin.
        c.setAttribute("visibility", "hidden");
        const begin = `${(i * 0.41) % 2.6}s`;
        const show = document.createElementNS(NS, "set");
        show.setAttribute("attributeName", "visibility");
        show.setAttribute("to", "visible");
        show.setAttribute("begin", begin);
        c.append(show);
        const m = document.createElementNS(NS, "animateMotion");
        m.setAttribute("dur", "2.6s");
        m.setAttribute("begin", begin);
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
    if (drawnIn || reduce.matches) return;
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
      // The arrowhead lands once the line has reached it.
      p.style.markerEnd = "none";
      const done = () => {
        p.style.strokeDasharray = "";
        p.style.markerEnd = "";
      };
      p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
        duration: 1000,
        delay: i * 70,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "backwards",
      }).finished.then(done, done);
    });
  }

  function mark() {
    for (const n of nodes) n.setAttribute("aria-expanded", String(n.dataset.node === current));
    for (const p of svg.querySelectorAll<SVGPathElement>("path")) {
      const on = current !== null && (p.dataset.a === current || p.dataset.b === current);
      p.classList.toggle("on", on);
      p.classList.toggle("dim", current !== null && !on);
    }
    auto?.paint();
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
      region.removeAttribute("data-mascot-avoid");
      sheet.setAttribute("data-mascot-avoid", "");
      if (!sheet.open) sheet.showModal();
      sheet.scrollTop = 0;
      must(sheet.querySelector<HTMLElement>("[data-flow-close]"), "[data-flow-close]").focus();
      // Keep the opened row visible above the sheet.
      requestAnimationFrame(() => {
        const r = btn.getBoundingClientRect();
        const top = innerHeight - sheet.getBoundingClientRect().height;
        // Below the sticky site header, if there is one.
        // Below the sticky site header and any sticky bar marked data-sticky-top.
        let min = 0;
        for (const el of document.querySelectorAll("header.nav, [data-sticky-top]")) {
          const b = el.getBoundingClientRect();
          if (b.top <= innerHeight / 3 && b.bottom > 0) min = Math.max(min, b.bottom);
        }
        if (r.bottom > top - 8 || r.top < min)
          scrollBy({
            top: r.top - Math.max(min + 8, (min + top - r.height) / 2),
            behavior: "instant",
          });
      });
    } else {
      if (sheet.open) sheet.close();
      sheet.removeAttribute("data-mascot-avoid");
      for (const n of nodes) n.setAttribute("aria-controls", region.id);
      region.dataset.state = "open";
      // The open panel counts as content for the mascot's rest spot (chat/content.ts).
      region.setAttribute("data-mascot-avoid", "");
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
      new CustomEvent("flow:select", {
        bubbles: true,
        detail: { id: nid, node: btn, edges: on },
      }),
    );
  }

  function close() {
    if (current === null) return;
    const btn = node(current);
    current = null;
    if (sheet.open) sheet.close();
    sheet.removeAttribute("data-mascot-avoid");
    region.removeAttribute("data-mascot-avoid");
    sheetBody.replaceChildren();
    region.dataset.state = "empty";
    region.removeAttribute("aria-labelledby");
    hint.hidden = false;
    region.replaceChildren(hint, all);
    mark();
    btn.focus();
    block.dispatchEvent(
      new CustomEvent("flow:close", { bubbles: true, detail: { id: btn.dataset.node } }),
    );
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

  /**
   * Idle tour of the flow. Holds are the reasons it is paused; it runs when there are none.
   * Interaction holds (hover, focus, touch, select) also clear the highlight, so it never
   * competes with what the person is looking at; view and hidden only freeze it.
   */
  function autoplay() {
    const lis = nodes.map((n) => must(n.closest("li"), "node li"));
    const holds = new Set<string>(["view"]);
    const later = new Map<string, number>();
    const HANDS = ["hover", "focus", "touch", "select"];
    let at = -1;
    let prev = -1;
    let lit = false;
    let timer = 0;

    const activeId = () => (lit && current === null && at >= 0 ? nodes[at]?.dataset.node : null);

    /** Real edges into the node: from the previous stop if there is one, else all of them.
     * A node with no incoming edge is lit on its own. */
    function into(nid: string): SVGPathElement[] {
      const paths = [...svg.querySelectorAll<SVGPathElement>("path")].filter(
        (p) => p.dataset.b === nid,
      );
      const from = prev >= 0 ? nodes[prev]?.dataset.node : null;
      const fromPrev = paths.filter((p) => p.dataset.a === from);
      return fromPrev.length ? fromPrev : paths;
    }

    function paint() {
      const nid = activeId();
      nodes.forEach((n, i) => {
        const on = nid != null && n.dataset.node === nid;
        n.classList.toggle("is-auto", on);
        lis[i]?.classList.toggle("is-auto", on);
      });
      const e = nid != null ? into(nid) : [];
      for (const p of svg.querySelectorAll<SVGPathElement>("path"))
        p.classList.toggle("auto", e.includes(p));
    }

    function step() {
      prev = at;
      at = (at + 1) % nodes.length;
      lit = true;
      paint();
      timer = window.setTimeout(step, STEP);
    }

    function sync() {
      clearTimeout(timer);
      const run = !reduce.matches && current === null && holds.size === 0;
      flow.dataset.auto = run ? "running" : "paused";
      if (run) {
        timer = window.setTimeout(step, lit ? STEP : FIRST);
        return;
      }
      if (reduce.matches || current !== null || HANDS.some((h) => holds.has(h))) {
        lit = false;
        paint();
      }
    }

    function hold(why: string) {
      clearTimeout(later.get(why));
      later.delete(why);
      holds.add(why);
      sync();
    }
    function release(why: string, after = 0) {
      clearTimeout(later.get(why));
      later.delete(why);
      if (!holds.has(why)) return;
      if (!after) {
        holds.delete(why);
        sync();
        return;
      }
      later.set(
        why,
        window.setTimeout(() => {
          later.delete(why);
          holds.delete(why);
          sync();
        }, after),
      );
    }

    flow.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "touch") hold("hover");
    });
    flow.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "touch") release("hover", RESUME);
    });
    // A touch is momentary: pause, and resume once the diagram has been left alone.
    block.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      hold("touch");
      release("touch", RESUME);
    });
    // Keyboard focus only: a mouse click focuses the button too, and that is covered by hover
    // and select, so focus left on a clicked node doesn't keep the tour stopped.
    block.addEventListener("focusin", (e) => {
      if ((e.target as Element).matches(":focus-visible")) hold("focus");
    });
    block.addEventListener("focusout", (e) => {
      if (!block.contains(e.relatedTarget as Node | null)) release("focus", RESUME);
    });
    block.addEventListener("flow:select", () => hold("select"));
    block.addEventListener("flow:close", () => release("select", RESUME));
    document.addEventListener("visibilitychange", () =>
      document.hidden ? hold("hidden") : release("hidden"),
    );
    reduce.addEventListener("change", sync);

    sync();
    return {
      paint,
      view: (on: boolean) => (on ? release("view") : hold("view")),
    };
  }
  if (flow.hasAttribute("data-autoplay")) auto = autoplay();

  setMode();
  draw();
  new ResizeObserver(() => requestAnimationFrame(layout)).observe(flow);
  document.fonts?.ready.then(() => requestAnimationFrame(layout));
  new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.isIntersecting);
      auto?.view(inView);
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
