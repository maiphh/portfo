/**
 * Document OCR motion (loaded by scripts/case/page.ts only without reduced motion):
 * - the authored moment: as the opener scrolls, a scan line runs down the sample page; each
 *   field box lights as the line passes and its value lands in the workbook cell (scrubbed,
 *   reversible on scroll back);
 * - the flow select effect: a one-pass scan line crosses the chosen node and a packet runs each
 *   connected edge once.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { packet } from "./effects";

gsap.registerPlugin(ScrollTrigger);

function proof(root: HTMLElement) {
  const sheet = root.querySelector<HTMLElement>("[data-proof]");
  const page = sheet?.querySelector<HTMLElement>(".ocr-page");
  const scan = sheet?.querySelector<HTMLElement>("[data-scan]");
  if (!sheet || !page || !scan) return;
  const boxes = [...sheet.querySelectorAll<HTMLElement>("[data-box]")];
  const cell = (id: string) => sheet.querySelector<HTMLElement>(`[data-cell="${id}"]`);
  sheet.classList.add("is-anim");
  const light = (y: number) => {
    for (const b of boxes) {
      const on = y >= b.offsetTop + b.offsetHeight / 2;
      b.classList.toggle("lit", on);
      cell(b.dataset.box ?? "")?.classList.toggle("lit", on);
    }
  };
  gsap.fromTo(
    scan,
    { y: 0 },
    {
      y: () => page.clientHeight - 2,
      ease: "none",
      scrollTrigger: {
        trigger: sheet,
        start: "top 75%",
        end: "bottom 35%",
        scrub: 0.4,
        invalidateOnRefresh: true,
        onUpdate: () => light(Number(gsap.getProperty(scan, "y"))),
      },
    },
  );
  light(0);
}

function flowSelect(root: HTMLElement) {
  for (const block of root.querySelectorAll<HTMLElement>("[data-flow-block]")) {
    const svg = block.querySelector<SVGSVGElement>("[data-flow-edges]");
    if (!svg) continue;
    block.addEventListener("flow:select", (e) => {
      const { id, node, edges } = (
        e as CustomEvent<{ id: string; node: HTMLElement; edges: SVGPathElement[] }>
      ).detail;
      const line = document.createElement("i");
      line.className = "flow-scan";
      line.setAttribute("aria-hidden", "true");
      node.append(line);
      line
        .animate(
          [
            { transform: "translateY(0)", opacity: 1 },
            { transform: `translateY(${node.offsetHeight - 2}px)`, opacity: 0 },
          ],
          { duration: 500, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        )
        .finished.finally(() => line.remove());
      edges.forEach((p, i) => setTimeout(() => packet(svg, p, p.dataset.a !== id), i * 60));
    });
  }
}

export default function ocr(root: HTMLElement) {
  proof(root);
  flowSelect(root);
}
