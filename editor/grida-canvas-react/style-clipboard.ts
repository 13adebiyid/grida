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
  "marker_start_shape",
  "marker_end_shape",
  "rectangular_stroke_width_top",
  "rectangular_stroke_width_right",
  "rectangular_stroke_width_bottom",
  "rectangular_stroke_width_left",
  "fe_shadows",
] as const;

export type VisualLayerStyle = {
  [K in (typeof VISUAL_LAYER_STYLE_KEYS)[number]]: unknown | null;
};

export type VisualLayerStyleCommands = Record<
  string,
  ((...args: unknown[]) => unknown) | undefined
>;

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

export function hasVisualLayerDecorations(style: VisualLayerStyle): boolean {
  return (
    (Array.isArray(style.stroke_paints) && style.stroke_paints.length > 0) ||
    (typeof style.stroke_width === "number" && style.stroke_width > 0) ||
    (typeof style.rectangular_stroke_width_top === "number" &&
      style.rectangular_stroke_width_top > 0) ||
    (typeof style.rectangular_stroke_width_right === "number" &&
      style.rectangular_stroke_width_right > 0) ||
    (typeof style.rectangular_stroke_width_bottom === "number" &&
      style.rectangular_stroke_width_bottom > 0) ||
    (typeof style.rectangular_stroke_width_left === "number" &&
      style.rectangular_stroke_width_left > 0) ||
    (Array.isArray(style.fe_shadows) && style.fe_shadows.length > 0)
  );
}

function safeCall(
  command: ((...args: unknown[]) => unknown) | undefined,
  ...args: unknown[]
): void {
  try {
    command?.(...args);
  } catch {
    // Unsupported decoration properties are best-effort across node types.
  }
}

/** Apply only border/stroke and shadow/glow decoration. Text, text
 * typography, fills, geometry, and content are deliberately out of scope. */
export function applyVisualLayerStyle(
  commands: VisualLayerStyleCommands,
  id: string,
  style: VisualLayerStyle
): void {
  const set = (value: unknown) => ({ type: "set", value });
  safeCall(commands.changeNodePropertyStrokes, id, style.stroke_paints ?? []);
  safeCall(
    commands.changeNodePropertyStrokeWidth,
    id,
    set(style.stroke_width ?? 0)
  );
  safeCall(
    commands.changeNodePropertyStrokeAlign,
    id,
    style.stroke_align ?? undefined
  );
  safeCall(
    commands.changeNodePropertyStrokeCap,
    id,
    style.stroke_cap ?? undefined
  );
  safeCall(
    commands.changeNodePropertyStrokeJoin,
    id,
    style.stroke_join ?? undefined
  );
  safeCall(
    commands.changeNodePropertyStrokeMiterLimit,
    id,
    style.stroke_miter_limit ?? undefined
  );
  safeCall(
    commands.changeNodePropertyStrokeDashArray,
    id,
    style.stroke_dash_array ?? undefined
  );
  safeCall(
    commands.changeNodePropertyStrokeDecorationStart,
    id,
    style.marker_start_shape ?? undefined
  );
  safeCall(
    commands.changeNodePropertyStrokeDecorationEnd,
    id,
    style.marker_end_shape ?? undefined
  );
  safeCall(
    commands.changeNodePropertyStrokeTopWidth,
    id,
    style.rectangular_stroke_width_top ?? 0
  );
  safeCall(
    commands.changeNodePropertyStrokeRightWidth,
    id,
    style.rectangular_stroke_width_right ?? 0
  );
  safeCall(
    commands.changeNodePropertyStrokeBottomWidth,
    id,
    style.rectangular_stroke_width_bottom ?? 0
  );
  safeCall(
    commands.changeNodePropertyStrokeLeftWidth,
    id,
    style.rectangular_stroke_width_left ?? 0
  );
  safeCall(commands.changeNodeFeShadows, id, style.fe_shadows ?? undefined);
}
