import { describe, expect, it } from "vitest";
import {
  boxAt,
  hitsAny,
  inMargins,
  lanes,
  perches,
  pick,
  roamSize,
  route,
  ROAM_MIN,
  yBounds,
} from "./roam";
import { gazeVector, mascotView, onPhase, toolPose, type MascotInput } from "./state";

const base: MascotInput = {
  phase: "idle",
  tool: null,
  open: false,
  hovering: false,
  focused: false,
  moving: false,
  now: 1000,
  happyUntil: 0,
  errorUntil: 0,
};
const v = (o: Partial<MascotInput>) => mascotView({ ...base, ...o });

describe("mascot state mapping", () => {
  it("idles by default", () => {
    expect(v({}).mood).toBe("idle");
  });

  it("thinks while verifying or thinking, with a per-tool pose", () => {
    expect(v({ phase: "verifying" }).mood).toBe("think");
    const t = v({ phase: "thinking", tool: "get_github_stats" });
    expect(t).toMatchObject({ mood: "think", tool: "get_github_stats", pose: { gaze: "right" } });
    expect(v({ phase: "thinking", tool: "get_project" }).pose.gaze).toBe("down");
    expect(v({ phase: "thinking", tool: "search_knowledge" }).pose.gaze).toBe("sweep");
    expect(v({ phase: "thinking", tool: "unknown_tool" }).pose).toEqual(toolPose(null));
  });

  it("talks while streaming, even when open or hovered", () => {
    expect(v({ phase: "answering" }).mood).toBe("talk");
    expect(v({ phase: "answering", open: true, hovering: true }).mood).toBe("talk");
  });

  it("chat activity wins over hover and travel", () => {
    expect(v({ phase: "thinking", hovering: true, moving: true }).mood).toBe("think");
  });

  it("is happy after an answer and droops after an error, for a moment", () => {
    const done = onPhase("answering", "done", 1000);
    expect(done.happyUntil).toBe(2200);
    expect(v({ phase: "done", happyUntil: 2200, now: 1500 }).mood).toBe("happy");
    expect(v({ phase: "done", happyUntil: 2200, now: 2300 }).mood).toBe("idle");
    const err = onPhase("thinking", "error", 1000);
    expect(err.errorUntil).toBe(3600);
    expect(v({ phase: "error", errorUntil: 3600, now: 2000 }).mood).toBe("error");
    expect(v({ phase: "error", errorUntil: 3600, now: 4000 }).mood).toBe("idle");
    expect(onPhase("done", "done", 1)).toEqual({});
    expect(onPhase("thinking", "done", 1)).toEqual({}); // done without an answer: no bounce
  });

  it("hover and travel moods apply only while the panel is closed", () => {
    expect(v({ hovering: true }).mood).toBe("hover");
    expect(v({ focused: true }).mood).toBe("hover");
    expect(v({ moving: true }).mood).toBe("move");
    expect(v({ open: true, hovering: true, moving: true }).mood).toBe("idle");
  });

  it("gaze vectors stay within -1..1, and follow means none", () => {
    for (const g of ["sweep", "down", "up", "left", "right", "center"] as const)
      for (const t of [0, 0.3, 1.7, 9]) {
        const p = gazeVector(g, t);
        expect(Math.abs(p?.x ?? 9)).toBeLessThanOrEqual(1);
        expect(Math.abs(p?.y ?? 9)).toBeLessThanOrEqual(1);
      }
    expect(gazeVector("follow", 1)).toBeNull();
  });
});

describe("roaming bounds", () => {
  // The site's content column: max 1320px plus a 4vw (20–56px) gutter.
  const column = (vw: number) => {
    const gutter = Math.min(56, Math.max(20, vw * 0.04));
    const wrap = Math.min(vw, 1320);
    const left = (vw - wrap) / 2 + gutter;
    return { left, right: vw - left };
  };

  it("sizes the mascot to the margin: 56px at 1440, 45px at 1280, none below", () => {
    expect(roamSize(column(1440), 1440)).toBe(56);
    expect(roamSize(column(1280), 1280)).toBe(45);
    expect(roamSize(column(1100), 1100)).toBeNull();
    expect(roamSize(column(768), 768)).toBeNull();
  });

  it("never sizes below the 44px tap target", () => {
    for (let vw = 1000; vw <= 2560; vw += 20) {
      const s = roamSize(column(vw), vw);
      if (s !== null) expect(s).toBeGreaterThanOrEqual(ROAM_MIN);
    }
  });

  it("lanes lie strictly outside the content column and inside the viewport", () => {
    for (const vw of [1280, 1366, 1440, 1920, 2560]) {
      const c = column(vw);
      const size = roamSize(c, vw);
      if (!size) throw new Error(`no size at ${vw}`);
      const ls = lanes(c, vw, size);
      expect(ls.map((l) => l.side)).toEqual(["L", "R"]);
      for (const l of ls) {
        expect(l.x0).toBeGreaterThanOrEqual(0);
        expect(l.x1 + size).toBeLessThanOrEqual(vw);
        if (l.side === "L") expect(l.x1 + size).toBeLessThanOrEqual(c.left);
        else expect(l.x0).toBeGreaterThanOrEqual(c.right);
      }
    }
  });

  it("perches are in the lane and off every obstacle", () => {
    const c = column(1440);
    const [L] = lanes(c, 1440, 56);
    if (!L) throw new Error("no lane");
    let seed = 0.13;
    const rand = () => (seed = (seed * 9301 + 0.49297) % 1);
    const obstacles = [{ left: 0, top: 300, right: 200, bottom: 360 }];
    const ys = Array.from({ length: 40 }, (_, i) => ({ y: 100 + i * 15, weight: 1 }));
    const ps = perches(L, ys, 56, obstacles, null, rand);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(L.x0);
      expect(p.x).toBeLessThanOrEqual(L.x1);
      expect(hitsAny(boxAt(p.x, p.y, 56), obstacles)).toBe(false);
      expect(inMargins(p.x, 56, [L], 1440)).toBe(true);
    }
    // Nothing between 236 and 368 survives (obstacle ± size ± 8px padding).
    expect(ps.some((p) => p.y + 56 > 292 && p.y < 368)).toBe(false);
    expect(pick(ps, () => 0)).toBe(ps[0]);
    expect(pick([], () => 0)).toBeNull();
  });

  it("changing sides goes out through the edges, never across the column", () => {
    const c = column(1440);
    const [L, R] = lanes(c, 1440, 56);
    if (!L || !R) throw new Error("lanes");
    const r = route({ x: 20, y: 200 }, { x: R.x0 + 5, y: 400, lane: R, weight: 1 }, 1440, 56);
    expect(r).toHaveLength(3);
    expect(r[0]?.x).toBeLessThan(0); // exit left, off-screen
    expect(r[1]).toMatchObject({ jump: true });
    expect(r[1]?.x).toBeGreaterThan(1440); // re-enter from the right edge
    expect(route({ x: 20, y: 200 }, { x: L.x1, y: 400, lane: L, weight: 1 }, 1440, 56)).toEqual([
      { x: L.x1, y: 400 },
    ]);
    // Every point of a same-lane move stays in the lane (lanes are convex).
    for (let t = 0; t <= 1; t += 0.1)
      expect(inMargins(20 + (L.x1 - 20) * t, 56, [L], 1440)).toBe(true);
    expect(inMargins(600, 56, [L, R], 1440)).toBe(false);
  });

  it("keeps perches below the nav and above the bottom edge", () => {
    expect(yBounds(69, 900, 56)).toEqual({ top: 97, bottom: 816 });
    expect(yBounds(69, 100, 56).bottom).toBe(97);
  });
});
