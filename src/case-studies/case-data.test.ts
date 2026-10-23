/** Every case study's data: a valid flow (ids, budgets, adjacent group members) and the parts
 * the template expects. */
import { describe, expect, it } from "vitest";
import type { CaseStudyData } from "~/lib/case";
import { flowProblems } from "~/lib/flow/types";
import { dvp } from "./data-validation/data";
import { ocr } from "./document-ocr/data";
import { ecom } from "./ecom/data";
import { legalRag } from "./legal-rag/data";
import { openportfo } from "./openportfo/data";
import { poet } from "./poet/data";

const all: Record<string, CaseStudyData> = {
  "document-ocr": ocr,
  "legal-rag": legalRag,
  "data-validation": dvp,
  openportfo,
  ecom,
  poet,
};

describe.each(Object.entries(all))("%s", (_slug, d) => {
  const flows = [d.how.flow, ...(d.how.application ? [d.how.application.flow] : [])];

  it("has a valid flow", () => {
    for (const { nodes, edges, cols, groups } of flows)
      expect(flowProblems(nodes, edges, cols, groups)).toEqual([]);
  });

  it("keeps each group's members adjacent (the group box and the list labels need it)", () => {
    for (const flow of flows) {
      const order = flow.nodes.map((n) => n.group ?? "");
      for (const g of new Set(order.filter(Boolean))) {
        const first = order.indexOf(g);
        const last = order.lastIndexOf(g);
        expect(order.slice(first, last + 1).every((x) => x === g)).toBe(true);
      }
    }
  });

  it("names a motion module, at least one highlight, and a caption for each", () => {
    expect(d.motion).toBeTruthy();
    expect(d.dives.length).toBeGreaterThanOrEqual(1);
    for (const x of d.dives) expect(x.caption.length).toBeGreaterThan(10);
  });
});
