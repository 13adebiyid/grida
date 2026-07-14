import { describe, expect, it } from "vitest";
import { animationValuesToStyle } from "./animation-sample";

describe("native animation DOM projection", () => {
  it("composes sampled transforms after the authored node transform", () => {
    expect(
      animationValuesToStyle(
        {
          opacity: 0.5,
          "translation-x": 40,
          "translation-y": -20,
          rotation: 15,
          "scale-x": 1.2,
          "scale-y": 0.8,
        },
        "rotate(10deg)"
      )
    ).toEqual({
      opacity: 0.5,
      transform:
        "rotate(10deg) translateX(40px) translateY(-20px) rotate(15deg) scaleX(1.2) scaleY(0.8)",
    });
  });

  it("does not erase authored opacity or transform when no track is sampled", () => {
    expect(animationValuesToStyle(undefined)).toEqual({});
  });
});
