import { describe, expect, it } from "vitest";
import { STORAGE_KEY, loadCorner, saveCorner } from "./persist";

function mem(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    key: (i) => [...m.keys()][i] ?? null,
  };
}

describe("mascot corner persist", () => {
  it("round-trips a corner id", () => {
    const s = mem();
    saveCorner("tl", s);
    expect(loadCorner(s)).toBe("tl");
    expect(JSON.parse(s.getItem(STORAGE_KEY)!)).toEqual({ corner: "tl" });
  });

  it("rejects junk and missing storage", () => {
    const s = mem();
    s.setItem(STORAGE_KEY, '{"corner":"middle"}');
    expect(loadCorner(s)).toBeNull();
    s.setItem(STORAGE_KEY, "not-json");
    expect(loadCorner(s)).toBeNull();
    expect(loadCorner(null)).toBeNull();
  });
});
