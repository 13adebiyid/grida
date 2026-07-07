import { describe, it, expect } from "vitest";
import { getClampOffsetForUnion } from "../transform";

// Rhema stage clamp — keeps dragged layers inside the stage bounds, but must
// NOT fight the operator on an axis the node cannot fit on. Regression pin
// for the 2026-07-07 report: a full-stage-width text layer snapped to center
// (red stage guides) then "reverted to the right" on release because the
// oversized union always satisfied `union.x < bounds.x` and got left-edge
// aligned.
describe("getClampOffsetForUnion", () => {
  const bounds = { x: 0, y: 0, width: 1920, height: 1080 };

  it("pushes a small node back inside when it overflows the right edge", () => {
    const union = { x: 1900, y: 100, width: 200, height: 100 };
    expect(getClampOffsetForUnion(union, bounds)).toEqual([-180, 0]);
  });

  it("pushes a small node back inside when it overflows the left/top edges", () => {
    const union = { x: -50, y: -20, width: 200, height: 100 };
    expect(getClampOffsetForUnion(union, bounds)).toEqual([50, 20]);
  });

  it("leaves a node WIDER than the stage alone on x (centering must stick)", () => {
    // 2200-wide text layer centered on a 1920 stage: overhangs both sides.
    const union = { x: -140, y: 400, width: 2200, height: 100 };
    expect(getClampOffsetForUnion(union, bounds)).toEqual([0, 0]);
  });

  it("leaves a node TALLER than the stage alone on y but still clamps x", () => {
    const union = { x: -50, y: -100, width: 200, height: 1300 };
    expect(getClampOffsetForUnion(union, bounds)).toEqual([50, 0]);
  });

  it("no offset when fully inside", () => {
    const union = { x: 10, y: 10, width: 100, height: 100 };
    expect(getClampOffsetForUnion(union, bounds)).toEqual([0, 0]);
  });
});
