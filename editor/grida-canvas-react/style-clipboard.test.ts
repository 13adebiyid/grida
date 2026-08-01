import { describe, expect, it } from "vitest";
import {
  applyVisualLayerStyle,
  hasVisualLayerDecorations,
  readVisualLayerStyle,
} from "./style-clipboard";

describe("style clipboards", () => {
  it("copies borders, shadows, and glows without text or fill style", () => {
    const style = readVisualLayerStyle({
      font_family: "Kalnia Glaze",
      font_size: 128,
      fill_paints: [{ type: "solid" }],
      stroke_paints: [{ type: "solid", color: "red" }],
      stroke_width: 8,
      stroke_align: "outside",
      marker_start_shape: "triangle",
      fe_shadows: [
        { type: "shadow", offset: [0, 8], blur: 16 },
        { type: "shadow", offset: [0, 0], blur: 24 },
      ],
    });
    expect(style).toMatchObject({
      stroke_paints: [{ type: "solid", color: "red" }],
      stroke_width: 8,
      stroke_align: "outside",
      marker_start_shape: "triangle",
      fe_shadows: [
        { type: "shadow", offset: [0, 8], blur: 16 },
        { type: "shadow", offset: [0, 0], blur: 24 },
      ],
    });
    expect(style).not.toHaveProperty("font_family");
    expect(style).not.toHaveProperty("font_size");
    expect(style).not.toHaveProperty("fill_paints");
  });

  it("records absent decorations so pasting a plain style clears the target", () => {
    expect(readVisualLayerStyle({ stroke_width: 0 })).toEqual({
      stroke_paints: null,
      stroke_width: 0,
      stroke_align: null,
      stroke_cap: null,
      stroke_join: null,
      stroke_miter_limit: null,
      stroke_dash_array: null,
      marker_start_shape: null,
      marker_end_shape: null,
      rectangular_stroke_width_top: null,
      rectangular_stroke_width_right: null,
      rectangular_stroke_width_bottom: null,
      rectangular_stroke_width_left: null,
      fe_shadows: null,
    });
  });

  it("distinguishes a real decoration from a fill-only layer", () => {
    expect(
      hasVisualLayerDecorations(
        readVisualLayerStyle({ fill_paints: [{ type: "solid" }] })
      )
    ).toBe(false);
    expect(
      hasVisualLayerDecorations(readVisualLayerStyle({ stroke_width: 3 }))
    ).toBe(true);
  });

  it("connects stored marker, per-side border, and shadow values to commands", () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const command =
      (name: string) =>
      (...args: unknown[]) => {
        calls.push([name, ...args]);
      };
    const commands = {
      changeNodePropertyStrokes: command("strokes"),
      changeNodePropertyStrokeWidth: command("width"),
      changeNodePropertyStrokeDecorationStart: command("marker-start"),
      changeNodePropertyStrokeDecorationEnd: command("marker-end"),
      changeNodePropertyStrokeTopWidth: command("top"),
      changeNodePropertyStrokeRightWidth: command("right"),
      changeNodePropertyStrokeBottomWidth: command("bottom"),
      changeNodePropertyStrokeLeftWidth: command("left"),
      changeNodeFeShadows: command("shadows"),
    };

    applyVisualLayerStyle(
      commands,
      "destination",
      readVisualLayerStyle({
        stroke_paints: [{ type: "solid" }],
        stroke_width: 6,
        marker_start_shape: "triangle",
        marker_end_shape: "circle",
        rectangular_stroke_width_top: 3,
        fe_shadows: [{ blur: 12 }],
      })
    );

    expect(calls).toContainEqual([
      "width",
      "destination",
      { type: "set", value: 6 },
    ]);
    expect(calls).toContainEqual(["marker-start", "destination", "triangle"]);
    expect(calls).toContainEqual(["marker-end", "destination", "circle"]);
    expect(calls).toContainEqual(["top", "destination", 3]);
    expect(calls).toContainEqual(["right", "destination", 0]);
    expect(calls).toContainEqual(["bottom", "destination", 0]);
    expect(calls).toContainEqual(["left", "destination", 0]);
    expect(calls).toContainEqual(["shadows", "destination", [{ blur: 12 }]]);
  });
});
