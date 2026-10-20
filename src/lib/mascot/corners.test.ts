import { describe, expect, it } from "vitest";
import { cornerSpots, nearestCorner } from "./corners";

const pad = { left: 24, right: 24, top: 24, bottom: 24 };
const spots = cornerSpots(1280, 900, 56, 56, pad);

describe("cornerSpots", () => {
  it("places the four corners inside the pads", () => {
    expect(spots.tl).toEqual({ x: 24, y: 24 });
    expect(spots.tr).toEqual({ x: 1280 - 56 - 24, y: 24 });
    expect(spots.bl).toEqual({ x: 24, y: 900 - 56 - 24 });
    expect(spots.br).toEqual({ x: 1280 - 56 - 24, y: 900 - 56 - 24 });
  });
});

describe("nearestCorner", () => {
  it("picks the closest corner by top-left distance", () => {
    expect(nearestCorner(100, 80, spots)).toBe("tl");
    expect(nearestCorner(1100, 50, spots)).toBe("tr");
    expect(nearestCorner(40, 800, spots)).toBe("bl");
    expect(nearestCorner(1200, 800, spots)).toBe("br");
  });

  it("resolves a center drop toward a quadrant corner", () => {
    // Drop near (400, 300) → box ≈ (372, 272) → top-left.
    expect(nearestCorner(372, 272, spots)).toBe("tl");
  });
});
