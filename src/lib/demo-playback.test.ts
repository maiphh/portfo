import { describe, expect, it } from "vitest";
import { shouldPlay, updateDemoMotion, updateDemoView, type DemoPlayback } from "./demo-playback";

const visible: DemoPlayback = {
  inView: true,
  pageVisible: true,
  userPaused: false,
  reducedMotion: false,
  manualMotion: false,
};

describe("demo playback policy", () => {
  it.each([true, false])("visibility gates manual play (%s)", (manualMotion) => {
    expect(shouldPlay({ ...visible, manualMotion })).toBe(true);
    expect(shouldPlay({ ...visible, manualMotion, inView: false })).toBe(false);
    expect(shouldPlay({ ...visible, manualMotion, pageVisible: false })).toBe(false);
  });
  it("explicit pause survives tab hide/show and leaving/returning", () => {
    const paused = { ...visible, userPaused: true, manualMotion: true };
    expect(shouldPlay(updateDemoView(updateDemoView(paused, false), true))).toBe(false);
    expect(shouldPlay({ ...paused, pageVisible: false })).toBe(false);
    expect(shouldPlay({ ...paused, pageVisible: true })).toBe(false);
  });
  it("reduced motion needs manual consent for each visible visit", () => {
    const reduced = updateDemoMotion(visible, true);
    expect(shouldPlay(reduced)).toBe(false);
    const consent = { ...reduced, manualMotion: true };
    expect(shouldPlay(consent)).toBe(true);
    const returned = updateDemoView(updateDemoView(consent, false), true);
    expect(returned.manualMotion).toBe(false);
    expect(shouldPlay(returned)).toBe(false);
    expect(shouldPlay({ ...consent, userPaused: true })).toBe(false);
  });
  it("preference changes reset manual motion, never clear explicit pause", () => {
    const paused = { ...visible, userPaused: true, manualMotion: true };
    for (const reduced of [true, false]) {
      const updated = updateDemoMotion(paused, reduced);
      expect(updated.manualMotion).toBe(false);
      expect(updated.userPaused).toBe(true);
      expect(shouldPlay(updated)).toBe(false);
    }
  });
  it("normal-motion view changes retain manual intent without overriding visibility", () => {
    const manual = { ...visible, manualMotion: true };
    const hidden = updateDemoView(manual, false);
    expect(shouldPlay(hidden)).toBe(false);
    expect(shouldPlay(updateDemoView(hidden, true))).toBe(true);
  });
});
