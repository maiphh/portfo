/**
 * The FlowDiagram lane layout on phones and tablets (every diagram: home and the six case
 * studies): real edges that touch their nodes, the group boxes, the legend on top, compact
 * boxes without a chevron, 2 lanes below a 390px phone, the acceptance shapes (the Worker hub,
 * Legal RAG's two ingest branches, POET's dashed redirect), keyboard, reduced motion, no-JS,
 * and the mascot staying off the card.
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
];
const WIDTHS = [320, 360, 390, 430, 768, 1024];
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
      test(`${d.name} at ${width}px: lanes, real edges on their nodes, groups, legend on top`, async ({
        page,
      }) => {
        await open(page, d, width);
        const m = await page.evaluate(measure, d.flow);
        // Phones and tablets up to 768px always get lanes; at 1024px the wider grids may fit.
        if (width <= 768) expect(m.lanesMode).toBe(true);
        if (m.lanesMode) {
          expect(m.lanes).toBeLessThanOrEqual(width < 390 ? 2 : 3);
          expect(m.legendAbove).toBe(true);
          expect(m.chevrons).toBe(0);
          expect(m.minTap).toBeGreaterThanOrEqual(44);
          // A real layout, not a column of bars: some rows hold two or three parts.
          expect(m.rowsWithTwo).toBeGreaterThan(0);
        }
        expect(m.paths).toBe(m.edges);
        expect(m.bad).toEqual([]);
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
    expect((await page.evaluate(measure, "how")).two).toBe(false);
    await open(page, diagram("home"), 360);
    expect((await page.evaluate(measure, "how")).two).toBe(true);
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
