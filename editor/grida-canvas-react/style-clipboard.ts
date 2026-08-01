export const VISUAL_LAYER_STYLE_CLIPBOARD_KEY =
  "bh-visual-layer-style-clipboard.v1";

type UnknownRecord = Record<string, unknown>;

const VISUAL_LAYER_STYLE_KEYS = [
  "stroke_paints",
  "stroke_width",
  "stroke_align",
  "stroke_cap",
  "stroke_join",
  "stroke_miter_limit",
  "stroke_dash_array",
  "stroke_decoration_start",
  "stroke_decoration_end",
  "rectangular_stroke_width_top",
  "rectangular_stroke_width_right",
  "rectangular_stroke_width_bottom",
  "rectangular_stroke_width_left",
  "fe_shadows",
] as const;

export type VisualLayerStyle = {
  [K in (typeof VISUAL_LAYER_STYLE_KEYS)[number]]: unknown | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Outer visual decoration only. Missing properties are represented as null
 * so copying a plain layer and pasting it clears a decorated target. */
export function readVisualLayerStyle(node: UnknownRecord): VisualLayerStyle {
  return Object.fromEntries(
    VISUAL_LAYER_STYLE_KEYS.map((key) => [key, node[key] ?? null])
  ) as VisualLayerStyle;
}

export function parseVisualLayerStyle(raw: string): VisualLayerStyle | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return isRecord(value) ? readVisualLayerStyle(value) : null;
  } catch {
    return null;
  }
}
