import { describe, expect, it } from "vitest";
import { readVisualLayerStyle } from "./style-clipboard";

describe("style clipboards", () => {
  it("copies borders, shadows, and glows without text or fill style", () => {
    const style = readVisualLayerStyle({
      font_family: "Kalnia Glaze",
      font_size: 128,
      fill_paints: [{ type: "solid" }],
      stroke_paints: [{ type: "solid", color: "red" }],
      stroke_width: 8,
      stroke_align: "outside",
      fe_shadows: [
        { type: "shadow", offset: [0, 8], blur: 16 },
        { type: "shadow", offset: [0, 0], blur: 24 },
      ],
    });
    expect(style).toMatchObject({
      stroke_paints: [{ type: "solid", color: "red" }],
      stroke_width: 8,
      stroke_align: "outside",
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
      stroke_decoration_start: null,
      stroke_decoration_end: null,
      rectangular_stroke_width_top: null,
      rectangular_stroke_width_right: null,
      rectangular_stroke_width_bottom: null,
      rectangular_stroke_width_left: null,
      fe_shadows: null,
    });
  });
});
