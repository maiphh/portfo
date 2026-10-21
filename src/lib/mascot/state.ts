/**
 * What the ink-dot mascot shows, from the chat's public events (portfo-chat:state / :status)
 * and its own pointer/focus/motion flags. Pure, so it is unit tested.
 */
import type { Phase } from "~/lib/chat/state";

export type Mood = "idle" | "hover" | "move" | "think" | "talk" | "happy" | "error";

/** Where the eyes go while a tool runs: a small, per-tool "what am I doing" cue. */
export type Gaze = "sweep" | "down" | "up" | "left" | "right" | "center" | "follow";

export interface ToolPose {
  gaze: Gaze;
  /** Ripple speed while thinking (1 = the prototype's). */
  ripple: number;
}

const TOOL_POSES: Record<string, ToolPose> = {
  list_projects: { gaze: "sweep", ripple: 1 },
  get_project: { gaze: "down", ripple: 0.8 },
  get_experience: { gaze: "up", ripple: 0.9 },
  get_contact: { gaze: "center", ripple: 0.7 },
  get_github_stats: { gaze: "right", ripple: 1.2 },
  get_popular_projects: { gaze: "left", ripple: 1.2 },
};

const THINK: ToolPose = { gaze: "sweep", ripple: 1 };
const REST: ToolPose = { gaze: "follow", ripple: 1 };

export function toolPose(tool: string | null | undefined): ToolPose {
  return (tool && TOOL_POSES[tool]) || THINK;
}

export interface MascotInput {
  phase: Phase;
  tool: string | null;
  open: boolean;
  hovering: boolean;
  focused: boolean;
  moving: boolean;
  now: number;
  /** Set when an answer finishes: a short happy bounce. */
  happyUntil: number;
  /** Set when a turn fails: a short droop. */
  errorUntil: number;
}

export interface MascotView {
  mood: Mood;
  pose: ToolPose;
  /** The tool being run while thinking, for data-tool and the tooltip. */
  tool: string | null;
}

export function mascotView(i: MascotInput): MascotView {
  if (i.phase === "verifying" || i.phase === "thinking")
    return { mood: "think", pose: toolPose(i.tool), tool: i.tool };
  if (i.phase === "answering") return { mood: "talk", pose: REST, tool: null };
  if (i.phase === "error" && i.now < i.errorUntil) return { mood: "error", pose: REST, tool: null };
  if (i.now < i.happyUntil) return { mood: "happy", pose: REST, tool: null };
  if (!i.open && (i.hovering || i.focused)) return { mood: "hover", pose: REST, tool: null };
  if (!i.open && i.moving) return { mood: "move", pose: REST, tool: null };
  return { mood: "idle", pose: REST, tool: null };
}

/** Timers a phase change starts. */
export function onPhase(
  prev: Phase,
  next: Phase,
  now: number,
): { happyUntil?: number; errorUntil?: number } {
  if (next === prev) return {};
  if (next === "done" && prev === "answering") return { happyUntil: now + 1200 };
  if (next === "error") return { errorUntil: now + 2600 };
  return {};
}

/** Eye direction (-1..1) for a gaze at time t (seconds). */
export function gazeVector(g: Gaze, t: number): { x: number; y: number } | null {
  switch (g) {
    case "sweep":
      return { x: Math.sin(t * 2.4) * 0.9, y: 0.15 };
    case "down":
      return { x: 0.15 * Math.sin(t * 3), y: 0.85 };
    case "up":
      return { x: -0.35, y: -0.8 };
    case "left":
      return { x: -0.9, y: 0 };
    case "right":
      return { x: 0.9, y: 0 };
    case "center":
      return { x: 0, y: 0 };
    case "follow":
      return null;
  }
}
