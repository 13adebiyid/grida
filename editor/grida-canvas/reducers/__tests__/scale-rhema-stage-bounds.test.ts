import { describe, expect, it } from "vitest";
import { constrainScaleMovementToBounds } from "../methods/scale";

const stage = { x: 0, y: 0, width: 1920, height: 1080 };

describe("Rhema stage resize bounds", () => {
  it("stops an east resize at the stage edge", () => {
    const movement = constrainScaleMovementToBounds({
      rect: { x: 100, y: 100, width: 500, height: 300 },
      origin: [100, 250],
      movement: [1500, 0],
      bounds: stage,
      preserveAspectRatio: false,
    });

    expect(movement[0]).toBeCloseTo(1320, 2);
    expect(movement[1]).toBe(0);
  });

  it("stops a west resize at the stage edge", () => {
    const movement = constrainScaleMovementToBounds({
      rect: { x: 100, y: 100, width: 500, height: 300 },
      origin: [600, 250],
      movement: [300, 0],
      bounds: stage,
      preserveAspectRatio: false,
    });

    expect(movement[0]).toBeCloseTo(100, 2);
  });

  it("preserves aspect ratio while respecting the tighter axis", () => {
    const movement = constrainScaleMovementToBounds({
      rect: { x: 1000, y: 500, width: 400, height: 400 },
      origin: [1000, 500],
      movement: [900, 900],
      bounds: stage,
      preserveAspectRatio: true,
    });

    expect(movement[0]).toBeCloseTo(180, 2);
    expect(movement[1]).toBeCloseTo(180, 2);
  });
});
