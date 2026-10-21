import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";
import type { ChatEvent } from "./sse";
import { initialTurn, isBusy, reduce, type Action, type TurnState } from "./state";

const ev = (event: ChatEvent): Action => ({ type: "event", event });
const run = (actions: Action[], from: TurnState = initialTurn) => actions.reduce(reduce, from);

describe("chat turn state machine", () => {
  it("walks a normal turn: thinking → status → answering → done", () => {
    let s = reduce(initialTurn, { type: "send" });
    expect(s.phase).toBe("thinking");
    s = reduce(s, ev({ type: "status", tool: "get_cv", label: "Checking the CV…" }));
    expect(s).toMatchObject({
      phase: "thinking",
      status: { tool: "get_cv", label: "Checking the CV…" },
    });
    s = reduce(s, ev({ type: "token", text: "He " }));
    s = reduce(s, ev({ type: "token", text: "ships." }));
    expect(s).toMatchObject({ phase: "answering", text: "He ships.", status: null });
    s = reduce(s, ev({ type: "sources", sources: [{ title: "CV", href: "/#timeline" }] }));
    expect(s.sources).toHaveLength(1);
    s = reduce(s, ev({ type: "done" }));
    expect(s).toMatchObject({ phase: "done", text: "He ships.", error: null });
  });

  it("verify moves a send into verifying, then a session or token continues", () => {
    const s = run([{ type: "send" }, { type: "verify" }]);
    expect(s.phase).toBe("verifying");
    expect(reduce(s, ev({ type: "session", token: "t", expiresAt: 1 })).phase).toBe("thinking");
    expect(reduce(s, ev({ type: "token", text: "x" })).phase).toBe("answering");
  });

  it("ignores a second send while busy, and accepts one after done or error", () => {
    const busy = run([{ type: "send" }, ev({ type: "token", text: "a" })]);
    expect(reduce(busy, { type: "send" })).toBe(busy);
    const done = reduce(busy, ev({ type: "done" }));
    expect(reduce(done, { type: "send" })).toEqual({ ...initialTurn, phase: "thinking" });
    const failed = reduce(busy, { type: "fail", error: friendlyError("network") });
    expect(reduce(failed, { type: "send" }).phase).toBe("thinking");
  });

  it("turns an error event into friendly copy", () => {
    const s = run([
      { type: "send" },
      ev({ type: "error", error: "upstream_error", message: "x" }),
      ev({ type: "sources", sources: [] }),
    ]);
    expect(s.phase).toBe("error");
    expect(s.error?.code).toBe("upstream_error");
    expect(s.error?.message).toMatch(/unavailable/);
  });

  it("ignores stale events after done, error or reset", () => {
    const done = run([{ type: "send" }, ev({ type: "token", text: "a" }), ev({ type: "done" })]);
    expect(reduce(done, ev({ type: "token", text: "late" }))).toBe(done);
    expect(reduce(initialTurn, ev({ type: "status", tool: "x", label: "y" }))).toBe(initialTurn);
    expect(reduce(done, { type: "reset" })).toBe(initialTurn);
  });

  it("keeps the answer visible when a tool runs after tokens", () => {
    const s = run([
      { type: "send" },
      ev({ type: "token", text: "a" }),
      ev({ type: "status", tool: "t", label: "L…" }),
    ]);
    expect(s).toMatchObject({ phase: "answering", text: "a", status: { tool: "t" } });
  });

  it("isBusy covers exactly the in-flight phases", () => {
    expect(
      ["idle", "verifying", "thinking", "answering", "done", "error"].map((p) =>
        isBusy(p as never),
      ),
    ).toEqual([false, true, true, true, false, false]);
  });
});

describe("friendlyError", () => {
  it("words the rate limit by Retry-After", () => {
    expect(friendlyError("rate_limited", { retryAfter: 10 }).message).toMatch(/few seconds/);
    expect(friendlyError("rate_limited", { retryAfter: 420 }).message).toMatch(/about 7 minutes/);
    expect(friendlyError("rate_limited", { retryAfter: 61 }).message).toMatch(/about 2 minutes/);
  });

  it("uses the Worker's daily-limit message, with a fallback", () => {
    expect(friendlyError("daily_limit", { serverMessage: "Back tomorrow." }).message).toBe(
      "Back tomorrow.",
    );
    expect(friendlyError("daily_limit").message).toMatch(/back tomorrow/);
    expect(friendlyError("daily_limit").retry).toBe(false);
  });

  it("has copy for network failures and unknown codes", () => {
    expect(friendlyError("network")).toMatchObject({ retry: true });
    expect(friendlyError("network").message).toMatch(/connection/);
    expect(friendlyError("unknown").message).toMatch(/went wrong/);
  });
});
