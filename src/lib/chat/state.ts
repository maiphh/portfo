/**
 * The state machine for one chat turn. Pure, so it is unit tested and shared by the panel
 * and (through `portfo-chat:state` events) the mascot in PR 3.
 *
 *   idle ─send→ thinking ─verify→ verifying ─session→ thinking
 *   thinking ─status→ thinking   (label for the "thinking" state)
 *   thinking|verifying ─token→ answering ─token→ answering
 *   any busy ─sources→ (same phase, sources set)
 *   any busy ─done→ done          any busy ─error|fail→ error
 *   done|error ─send→ thinking    any ─reset→ idle
 */
import { errorCode, friendlyError, type ChatError } from "./errors";
import type { ChatEvent, Source } from "./sse";

export type Phase = "idle" | "verifying" | "thinking" | "answering" | "done" | "error";

export interface Status {
  tool: string;
  label: string;
}

export interface TurnState {
  phase: Phase;
  status: Status | null;
  text: string;
  sources: Source[];
  error: ChatError | null;
}

export type Action =
  | { type: "send" }
  | { type: "verify" }
  | { type: "event"; event: ChatEvent }
  | { type: "fail"; error: ChatError }
  | { type: "reset" };

export const initialTurn: TurnState = {
  phase: "idle",
  status: null,
  text: "",
  sources: [],
  error: null,
};

export const isBusy = (p: Phase) => p === "verifying" || p === "thinking" || p === "answering";

export function reduce(s: TurnState, a: Action): TurnState {
  if (a.type === "reset") return initialTurn;
  if (a.type === "send") return isBusy(s.phase) ? s : { ...initialTurn, phase: "thinking" };
  if (!isBusy(s.phase)) return s; // stale events after done/error/reset are ignored
  if (a.type === "verify") return s.phase === "thinking" ? { ...s, phase: "verifying" } : s;
  if (a.type === "fail") return { ...s, phase: "error", status: null, error: a.error };
  const e = a.event;
  switch (e.type) {
    case "session":
      return s.phase === "verifying" ? { ...s, phase: "thinking" } : s;
    case "status": {
      const status = { tool: e.tool, label: e.label };
      // A tool call after the answer started keeps the answer on screen.
      return s.phase === "answering" ? { ...s, status } : { ...s, phase: "thinking", status };
    }
    case "token":
      return { ...s, phase: "answering", status: null, text: s.text + e.text };
    case "sources":
      return { ...s, sources: e.sources };
    case "done":
      return { ...s, phase: "done", status: null };
    case "error":
      return {
        ...s,
        phase: "error",
        status: null,
        error: friendlyError(errorCode(e.error), { serverMessage: e.message }),
      };
  }
}
