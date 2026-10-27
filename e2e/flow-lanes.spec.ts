/**
 * The FlowDiagram lane layout on phones and tablets (every diagram: home and the six case
 * studies): real edges that touch their nodes, the group boxes, the legend on top, compact
 * boxes without a chevron, 2 lanes on phones (below 480px), labels that are never cut, no edge
 * through a box that isn't its own (desktop grid too), the acceptance shapes (the Worker hub,
 * Legal RAG's two ingest branches, POET's dashed redirect), keyboard, reduced motion, no-JS,
 * and the mascot staying off the card, docked or dragged.
 */
import { expect, test, type Page } from "@playwright/test";
import { overflowReport } from "./overflow";

const DIAGRAMS = [
  { name: "home", url: "/", flow: "how" },
  ...["document-ocr", "legal-rag", "data-validation", "openportfo", "ecom", "poet"].map((s) => ({
    name: s,
    url: `/work/${s}/`,
    flow: "cs",
  })),
  { name: "document-ocr application", url: "/work/document-ocr/", flow: "app" },
  { name: "data-validation application", url: "/work/data-validation/", flow: "app" },
];
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1440];
const diagram = (name: string) => {
  const d = DIAGRAMS.find((x) => x.name === name);
  if (!d) throw new Error(`no diagram ${name}`);
  return d;
};

/** Everything about the drawn lane layout, measured in the page. */
function measure(id: string) {
  const flow = document.querySelector<HTMLElement>(`[data-flow="${id}"]`);
  if (!flow) throw new Error("no flow");
  const o = flow.getBoundingClientRect();
  const rel = (r: DOMRect) => ({
    l: r.left - o.left,
    t: r.top - o.top,
    r: r.right - o.left,
    b: r.bottom - o.top,
  });
  const boxOf = (nid: string) => {
    const el = flow.querySelector(`[data-node="${nid}"]`);
    return el ? rel(el.getBoundingClientRect()) : null;
  };
  const tol = 1.5;
  const onBorder = (
    [x, y]: [number, number],
    b: { l: number; t: number; r: number; b: number },
  ) => {
    const inX = x >= b.l - tol && x <= b.r + tol;
    const inY = y >= b.t - tol && y <= b.b + tol;
    const nearV = Math.abs(x - b.l) <= tol || Math.abs(x - b.r) <= tol;
    const nearH = Math.abs(y - b.t) <= tol || Math.abs(y - b.b) <= tol;
    return (nearV && inY) || (nearH && inX);
  };
  const edges = JSON.parse(flow.dataset.edges ?? "[]") as [string, string, string?][];
  const paths = [...flow.querySelectorAll<SVGPathElement>("svg.flow-edges path")];
  const bad: string[] = [];
  for (const p of paths) {
    const len = p.getTotalLength();
    const s = p.getPointAtLength(0);
    const e = p.getPointAtLength(len);
    const a = boxOf(p.dataset.a ?? "");
    const b = boxOf(p.dataset.b ?? "");
    if (!a || !b || !onBorder([s.x, s.y], a) || !onBorder([e.x, e.y], b))
      bad.push(
        `${p.dataset.a}→${p.dataset.b} (${s.x.toFixed(1)},${s.y.toFixed(1)})→(${e.x.toFixed(1)},${e.y.toFixed(1)})`,
      );
  }
  // Edges never pass through a box other than their own two (2px inside its border).
  const crossings: string[] = [];
  const all = [...flow.querySelectorAll<HTMLElement>("[data-node]")].map((n) => ({
    id: n.dataset.node ?? "",
    r: rel(n.getBoundingClientRect()),
  }));
  for (const p of paths) {
    const len = p.getTotalLength();
    for (const n of all) {
      if (n.id === p.dataset.a || n.id === p.dataset.b) continue;
      for (let at = 0; at <= len; at += 2) {
        const q = p.getPointAtLength(at);
        if (q.x > n.r.l + 2 && q.x < n.r.r - 2 && q.y > n.r.t + 2 && q.y < n.r.b - 2) {
          crossings.push(`${p.dataset.a}→${p.dataset.b} through ${n.id}`);
          break;
        }
      }
    }
  }
  // Titles and sub-lines wrap to two lines at most; none may be cut (clamped or ellipsized).
  const cut = [...flow.querySelectorAll<HTMLElement>(".flow-node .t, .flow-node .s")]
    .filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)
    .map((e) => (e.textContent ?? "").trim());
  const list = flow.querySelector<HTMLElement>(".flow-nodes") ?? flow;
  const legend = flow.querySelector(".flow-legend");
  const nodes = [...flow.querySelectorAll<HTMLElement>(".flow-node")];
  const rows = new Set(nodes.map((n) => Math.round(n.getBoundingClientRect().top)));
  return {
    lanesMode: flow.classList.contains("is-lanes"),
    two: flow.classList.contains("is-2"),
    lanes: getComputedStyle(list).gridTemplateColumns.split(" ").length,
    edges: edges.length,
    paths: paths.length,
    bad,
    crossings,
    cut,
    ends: paths.map((p) => {
      const e = p.getPointAtLength(p.getTotalLength());
      return [`${p.dataset.a}→${p.dataset.b}`, e.x, e.y] as const;
    }),
    styles: paths.map(
      (p) =>
        [
          `${p.dataset.a}→${p.dataset.b}`,
          p.getAttribute("class") ?? "",
          p.getTotalLength(),
        ] as const,
    ),
    legendAbove: legend
      ? legend.getBoundingClientRect().bottom <=
        Math.min(...nodes.map((n) => n.getBoundingClientRect().top))
      : true,
    chevrons: nodes.filter((n) => getComputedStyle(n, "::after").display !== "none").length,
    minTap: Math.min(...nodes.map((n) => n.getBoundingClientRect().height)),
    rowsWithTwo: [...rows].filter(
      (y) => nodes.filter((n) => Math.round(n.getBoundingClientRect().top) === y).length > 1,
    ).length,
    groups: Object.keys(JSON.parse(flow.dataset.groups ?? "{}")).length,
    groupBoxes: [...flow.querySelectorAll<HTMLElement>(".flow-groupbox")].map((g) => {
      const r = rel(g.getBoundingClientRect());
      const label = g.textContent ?? "";
      return { label, r };
    }),
    members: [...flow.querySelectorAll<HTMLElement>(".flow-nodes > li[data-group]")].map((li) => ({
      g: JSON.parse(flow.dataset.groups ?? "{}")[li.dataset.group ?? ""] as string,
      r: rel((li.querySelector(".flow-node") ?? li).getBoundingClientRect()),
    })),
  };
}

async function open(page: Page, d: (typeof DIAGRAMS)[number], width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(d.url);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(`[data-flow="${d.flow}"]`).scrollIntoViewIfNeeded();
  await expect(page.locator(`[data-flow="${d.flow}"] svg.flow-edges path`).first()).toBeAttached();
}

test.describe("lane layout geometry", () => {
  test.skip(({ isMobile }) => isMobile, "sized with setViewportSize on the desktop project");

  for (const d of DIAGRAMS)
    for (const width of WIDTHS)
      test(`${d.name} at ${width}px: lanes, real edges on their nodes and through no other, groups, legend on top, no cut labels`, async ({
        page,
      }) => {
        await open(page, d, width);
        const m = await page.evaluate(measure, d.flow);
        // Phones and tablets up to 768px always get lanes; at 1024px the wider grids may fit.
        if (width <= 768) expect(m.lanesMode).toBe(true);
        if (m.lanesMode) {
          expect(m.lanes).toBeLessThanOrEqual(width < 480 ? 2 : 3);
          expect(m.legendAbove).toBe(true);
          expect(m.chevrons).toBe(0);
          expect(m.minTap).toBeGreaterThanOrEqual(44);
          // A real layout, not a column of bars: some rows hold two or three parts.
          expect(m.rowsWithTwo).toBeGreaterThan(0);
        }
        expect(m.paths).toBe(m.edges);
        expect(m.bad).toEqual([]);
        expect(m.crossings).toEqual([]);
        expect(m.cut).toEqual([]);
        // Every group's box holds all of its members.
        expect(m.groupBoxes.length).toBe(m.groups);
        for (const { g, r } of m.members) {
          const box = m.groupBoxes.find((b) => b.label === g);
          if (!box) throw new Error(`no group box for ${g}`);
          expect(r.l).toBeGreaterThanOrEqual(box.r.l);
          expect(r.r).toBeLessThanOrEqual(box.r.r);
          expect(r.t).toBeGreaterThanOrEqual(box.r.t);
          expect(r.b).toBeLessThanOrEqual(box.r.b);
        }
        expect(await page.evaluate(overflowReport, "[data-flow-block]")).toEqual([]);
      });

  test("home on a phone: the Worker is a hub with every one of its edges drawn", async ({
    page,
  }) => {
    for (const width of [360, 390]) {
      await open(page, diagram("home"), width);
      const m = await page.evaluate(measure, "how");
      const hub = m.styles.filter(([e]) => e.split("→").includes("worker"));
      expect(hub.length).toBe(7);
      // Its neighbours sit around it: above, beside and below.
      const pos = await page.evaluate(() => {
        const r = (n: string) =>
          document.querySelector(`[data-flow="how"] [data-node="${n}"]`)?.getBoundingClientRect() ??
          new DOMRect();
        const w = r("worker");
        return ["browser", "d1", "quota", "github"].map((n) =>
          Math.sign(Math.round(r(n).top - w.top)),
        );
      });
      expect(pos[0]).toBe(-1);
      expect(pos[1]).toBe(1);
      expect(pos[2]).toBe(1);
      expect(pos[3]).toBe(0);
    }
    // Phones use the 2-lane layout; a tablet has room for three.
    expect((await page.evaluate(measure, "how")).two).toBe(true);
    await open(page, diagram("home"), 768);
    expect((await page.evaluate(measure, "how")).two).toBe(false);
  });

  test("home: the Cron Trigger reaches the Worker on its own port, not along the browser's edge", async ({
    page,
  }) => {
    for (const width of [360, 390, 430, 768, 1440]) {
      await open(page, diagram("home"), width);
      const m = await page.evaluate(measure, "how");
      const end = (e: string) => {
        const hit = m.ends.find(([k]) => k === e);
        if (!hit) throw new Error(`no edge ${e}`);
        return hit;
      };
      const [, bx, by] = end("browser→worker");
      const [, cx, cy] = end("cron→worker");
      expect(Math.hypot(bx - cx, by - cy), `${width}px`).toBeGreaterThanOrEqual(12);
    }
  });

  test("Legal RAG on a phone: the two ingest branches merge into PostgreSQL", async ({ page }) => {
    for (const width of [360, 390]) {
      await open(page, diagram("legal-rag"), width);
      const m = await page.evaluate(measure, "cs");
      const into = m.styles.filter(([e]) => e.endsWith("→db")).map(([e]) => e);
      expect(into).toEqual(expect.arrayContaining(["html→db", "hybrid→db"]));
      // Side by side: the link branch and the PDF branch start in the same row.
      const [a, b] = await page.evaluate(() =>
        ["link", "pdf"].map((n) =>
          Math.round(
            (
              document
                .querySelector(`[data-flow="cs"] [data-node="${n}"]`)
                ?.getBoundingClientRect() ?? new DOMRect()
            ).top,
          ),
        ),
      );
      expect(a).toBe(b);
    }
  });

  test("POET on a phone: the dashed redirect from PayOS to the return page is drawn and long enough to read", async ({
    page,
  }) => {
    for (const width of [320, 360, 390]) {
      await open(page, diagram("poet"), width);
      const m = await page.evaluate(measure, "cs");
      const dashed = m.styles.find(([e]) => e === "payos→receipt");
      expect(dashed?.[1]).toContain("dashed");
      expect(dashed?.[2]).toBeGreaterThan(60);
      expect(
        await page
          .locator('[data-flow="cs"] path.dashed')
          .evaluate((p) => getComputedStyle(p).strokeDasharray),
      ).not.toBe("none");
    }
  });

  test("keyboard on a phone layout: arrows follow the path, Enter opens the sheet, Esc returns", async ({
    page,
  }) => {
    await open(page, diagram("home"), 390);
    await page.locator('[data-flow="how"] [data-node="browser"]').focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-flow="how"] [data-node="pages"]')).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.locator('[data-flow="how"] [data-node="github"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog#how-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog#how-sheet")).toBeHidden();
    await expect(page.locator('[data-flow="how"] [data-node="github"]')).toBeFocused();
  });

  test("reduced motion on a phone: edges drawn, no packets, no tour", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, diagram("home"), 390);
    await page.waitForTimeout(3000);
    const m = await page.evaluate(measure, "how");
    expect(m.paths).toBe(m.edges);
    await expect(page.locator('[data-flow="how"] circle.pk')).toHaveCount(0);
    await expect(page.locator('[data-flow="how"] .is-auto')).toHaveCount(0);
  });

  test("without JS on a phone: one column of parts, every detail on the page", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto("/work/legal-rag/");
    const lefts = await page
      .locator('[data-flow="cs"] .flow-node')
      .evaluateAll((ns) => [...new Set(ns.map((n) => Math.round(n.getBoundingClientRect().left)))]);
    expect(lefts.length).toBe(1);
    await expect(page.locator('[data-flow="cs"] ~ .flow-detail .flow-d')).toHaveCount(12);
    expect(await page.evaluate(overflowReport, "[data-flow-block]")).toEqual([]);
    await ctx.close();
  });
});

test.describe("mascot on phones", () => {
  test.skip(({ isMobile }) => !isMobile, "phone launcher");

  for (const width of [360, 390])
    for (const d of [diagram("home"), diagram("legal-rag")])
      test(`the docked mascot doesn't sit on the ${d.name} diagram at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(d.url);
        await page.waitForFunction(
          () => !!(window as { __portfoMascot?: unknown }).__portfoMascot,
          null,
          {
            timeout: 15_000,
          },
        );
        const flow = page.locator(`[data-flow="${d.flow}"]`);
        // Scroll so the card fills the bottom of the window, where the launcher docks.
        for (const at of ["start", "center", "end"] as const) {
          await flow.evaluate((el, block) => el.scrollIntoView({ block }), at);
          await page.waitForTimeout(1400);
          const hit = await page.evaluate((id) => {
            const l = document.querySelector<HTMLElement>("[data-chat-launcher]");
            const f = document.querySelector(`[data-flow="${id}"]`);
            if (!l || !f) return "missing";
            if (Number(getComputedStyle(l).opacity) < 0.05) return null;
            const a = l.getBoundingClientRect();
            const b = f.getBoundingClientRect();
            const overlap =
              a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            return overlap ? `launcher ${JSON.stringify(a)} over card ${JSON.stringify(b)}` : null;
          }, d.flow);
          expect(hit, at).toBeNull();
        }
      });
});

test.describe("a dragged mascot on a phone-width diagram", () => {
  test.skip(({ isMobile }) => isMobile, "mouse drag, sized on the desktop project");

  /** Drags the launcher to (x, y) and waits for the snap to settle; focus cleared. */
  async function dragTo(page: Page, x: number, y: number) {
    const l = page.locator("[data-chat-launcher]");
    await l.evaluate((el) => el.classList.remove("is-tucked"));
    await page.waitForTimeout(350);
    const b = await l.boundingBox();
    if (!b) throw new Error("no launcher box");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as { __portfoMascot?: { moving(): boolean } }).__portfoMascot?.moving(),
        ),
      )
      .toBe(false);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }

  /** null when the launcher is hidden or clear of the diagram card; else what it covers. */
  const onCard = (page: Page, id: string) =>
    page.evaluate((fid) => {
      const l = document.querySelector<HTMLElement>("[data-chat-launcher]");
      const f = document.querySelector(`[data-flow="${fid}"]`);
      if (!l || !f) return "missing";
      if (Number(getComputedStyle(l).opacity) < 0.05) return null;
      const a = l.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      if (a.right <= 0 || a.left >= vw) return null;
      const b = f.getBoundingClientRect();
      const hit = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return hit ? `launcher ${Math.round(a.left)},${Math.round(a.top)} on the card` : null;
    }, id);

  for (const [corner, x, y] of [
    ["bottom right", 385, 840],
    ["top left", 5, 5],
  ] as const)
    test(`Legal RAG at 390px, dragged to the ${corner}: never on the card, tooltip inside the window`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/work/legal-rag/");
      await page.evaluate(() => sessionStorage.clear());
      await page.waitForFunction(
        () => !!(window as { __portfoMascot?: unknown }).__portfoMascot,
        null,
        { timeout: 15_000 },
      );
      // The hero fills the first screen, so the docked launcher starts tucked; scroll until it shows.
      await expect
        .poll(async () => {
          const tucked = await page.evaluate(() => {
            const l = document.querySelector("[data-chat-launcher]");
            if (l?.classList.contains("is-tucked")) scrollBy(0, 160);
            return l?.classList.contains("is-tucked");
          });
          return tucked;
        })
        .toBe(false);
      await dragTo(page, x, y);
      await expect(page.locator("[data-chat-launcher]")).toHaveAttribute("data-mascot", "float");
      const flow = page.locator('[data-flow="cs"]');
      for (const at of ["start", "center", "end"] as const) {
        await flow.evaluate((el, block) => el.scrollIntoView({ block }), at);
        await page.waitForTimeout(700);
        expect(await onCard(page, "cs"), at).toBeNull();
      }
      // Off the card (page top): the mascot is back in a corner and its tooltip fits.
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(700);
      const l = page.locator("[data-chat-launcher]");
      await expect(l).not.toHaveClass(/is-yield/);
      await l.hover();
      const tip = page.locator(".mascot-tip");
      await expect(tip).toHaveCSS("opacity", "1");
      const t = await tip.boundingBox();
      if (!t) throw new Error("no tip box");
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(390);
      expect(t.y + t.height).toBeLessThanOrEqual(844);
    });
});
