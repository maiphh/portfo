import { describe, expect, it } from "vitest";
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
    expect(v({ phase: "thinking", tool: "list_projects" }).pose.gaze).toBe("sweep");
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
