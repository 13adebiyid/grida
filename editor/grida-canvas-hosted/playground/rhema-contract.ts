import grida from "@grida/schema";
import { css } from "@/grida-canvas-utils/css";

export const RHEMA_SCRIPTURE_BINDING_KEY = "rhema_binding_scripture_node_id";
export const RHEMA_REFERENCE_BINDING_KEY = "rhema_binding_reference_node_id";
export const RHEMA_REFERENCE_INCLUDE_VERSION_KEY =
  "rhema_reference_include_version";

/**
 * Bundle-name userData key. Grida has no document-level userData, so we
 * stamp this on every scene's userData in the document — any scene can
 * answer "what bundle am I in?" without ambiguity. Read: take the first
 * non-empty value from scenes_ref. Write: stamp on every scene.
 */
export const RHEMA_BUNDLE_NAME_KEY = "rhema_bundle_name";

/**
 * Workspace discriminator stamped on every scene's userData. Determines
 * which set of dynamic-text bindings and runtime behaviors apply to the
 * scene. Default is "theme" (the original behavior). "stage" enables
 * stage-confidence-monitor features (clock, countdown, current/next
 * slide previews) and is rendered by BH's /live route in a stage layout
 * pipeline instead of the scripture pipeline. "slide" is a single-scene
 * ephemeral authoring mode used by the New Slide Slot flow — saves
 * round-trip to BH as private slide themes (one Grida document per
 * lyric slide). The single-scene constraint + simpler chrome are
 * enforced in playground.tsx; the runtime payload shape stays
 * identical to "theme" so PrivateSlideRender on the BH side keeps
 * working unchanged.
 *
 * Stamping at the data layer (vs a runtime flag) enforces workspace
 * boundaries per the adversarial-review recommendation — node lookups
 * filter by workspace, so a stage clock node can't accidentally bind to
 * a theme scripture target.
 */
export const RHEMA_WORKSPACE_KEY = "rhema_workspace";
export type RhemaWorkspace = "theme" | "stage" | "slide";

/**
 * Scene-userdata key for the looping background-video reference. The
 * operator picks a clip in the editor; BH stores the bytes in IndexedDB
 * and hands back a `blobKey` (plus name/mimeType) which we stamp here.
 * Stored on scene userdata so it round-trips on reopen via the JSON
 * sidecar (same mechanism as workspace / visibility-rule keys), and is
 * read back into the runtime payload by buildRhemaThemeRuntimeJson.
 */
export const RHEMA_BACKGROUND_VIDEO_KEY = "rhema_background_video";

/** Looping background-video reference carried on a theme. `blobKey`
 *  resolves to the bytes BH stored in IndexedDB; name/mimeType are
 *  optional display + decode hints. */
export type RhemaBackgroundVideo = {
  blobKey: string;
  name?: string;
  mimeType?: string;
};

/** Stage-only binding keys. Like the scripture/reference binding keys
 *  but addressing dynamic-source text nodes (clock, etc.). */
export const RHEMA_CLOCK_BINDING_KEY = "rhema_binding_clock_node_id";
export const RHEMA_NEXT_LAYOUT_BINDING_KEY =
  "rhema_binding_next_layout_node_id";

export interface RhemaStageBindings {
  clockNodeId: string | null;
  nextLayoutNodeId: string | null;
}

/**
 * Per-node component kind for stage layouts. Stored on a node's
 * userdata when the operator inserts that node from the stage palette
 * (e.g. clicking "Clock" creates a tspan + stamps kind="clock"). BH's
 * /live runtime evaluates the kind and replaces the rendered text/
 * content with a live data source.
 *
 * Kinds correspond 1:1 to the tools approved in the stage editor spec:
 *  scripture       - current verse text (driven by operator console)
 *  reference       - current verse reference (e.g. "John 3:16 - KJV")
 *  next-up         - preview-pane verse text (what's queued next)
 *  clock           - live wall clock (1Hz tick)
 *  segment-timer   - operator-controlled count-down / up
 *  video-countdown - countdown of the active media item
 *  stage-message   - operator-typed message (live cue channel)
 *  slide-notes     - per-bundle-layout sermon notes
 *  screen-preview  - miniature live render of an audience output
 */
export const RHEMA_COMPONENT_KIND_KEY = "rhema_component_kind";
export type RhemaComponentKind =
  | "scripture"
  | "reference"
  | "next-up"
  | "next-slide-text"
  | "clock"
  | "segment-timer"
  | "segment-title"
  | "video-countdown"
  | "audio-countdown"
  | "preshow-countdown"
  | "stage-message"
  | "slide-notes"
  | "screen-preview";

/**
 * Per-NODE visibility rule. Stored on a node's userData. Lets the
 * operator say "this lower-third backdrop only renders when the
 * scripture text node has content" — ProPresenter's "Object is shown
 * when…" feature applied to BH's scripture/reference flow.
 *
 * v1 scope: a single condition predicate, evaluated against any text
 * node referenced by id. More predicate kinds (is-empty / equals /
 * has-reference) can be added in a backwards-compatible way later.
 */
export const RHEMA_VISIBILITY_RULE_KEY = "rhema_visibility_rule";

export type RhemaVisibilityCondition = "has-text" | "is-empty";

export type RhemaVisibilityRule = {
  /** "has-text": show when source text node is non-empty. "is-empty": inverse. */
  condition: RhemaVisibilityCondition;
  /** Node id whose text presence drives the rule. Must be a text node. */
  sourceTextNodeId: string;
};

/**
 * Bundle save payload — sent when the document contains ≥2 scenes OR
 * the operator has explicitly named the bundle. Each scene becomes one
 * `RhemaThemeRuntimeJson` layout entry. The whole document round-trips
 * back into the same Grida room when the operator clicks "Open editor"
 * on any leaf in BH's themes tree.
 */
export type RhemaThemeBundleRuntimeJson = {
  kind: "rhema-theme-bundle";
  version: 1;
  bundleName: string;
  /** Stable id for the bundle — derived from the Grida room/filekey. */
  bundleId: string;
  layouts: RhemaThemeRuntimeJson[];
};

export type RhemaSceneBindings = {
  scriptureNodeId: string | null;
  referenceNodeId: string | null;
  includeVersionInReference: boolean;
};

export type RhemaTextLayerRuntimeStyle = {
  color: string | null;
  fontFamily: string | null;
  fontSize: number | null;
  fontWeight: number | string | null;
  fontStyle: string | null;
  lineHeight: number | null;
  letterSpacing: number | null;
  textAlign: "left" | "center" | "right" | "justify" | null;
  /** Text outline (Grida stroke). strokeColor is a CSS color; strokeWidth is in
   *  px. Both null when the node has no stroke. Rendered downstream as
   *  -webkit-text-stroke + paint-order:stroke (outline behind the glyph fill). */
  strokeColor: string | null;
  strokeWidth: number | null;
  /** Ready-to-use CSS `text-shadow` string built from the node's drop shadows
   *  (Grida fe_shadows), or null when there are none. */
  textShadow: string | null;
  /** The FULL computed React text CSS for this node, produced by the SAME
   *  `css.toReactTextStyle` the editor canvas uses — so the live output matches
   *  the editor pixel-for-pixel for every text feature (text-decoration,
   *  text-transform, em-correct letter/word-spacing, font-variation/feature
   *  settings, vertical align, kerning…). `fontSize` and `color` are stripped:
   *  fontSize is owned by BH's autosize and color by the structured `color`
   *  field above (so gradient fills don't land as an invalid `color`). Downstream
   *  `applyLayerStyle` spreads this over the structured fields, so it also
   *  corrects unit mismatches (e.g. letterSpacing px→em). Null = no extra css. */
  css: Record<string, string | number> | null;
};

export type RhemaThemeRuntimeJson = {
  kind: "rhema-theme-runtime";
  version: 1;
  scene: {
    id: string;
    name: string;
  };
  /** Present on SEED replies for bundle-hosted layouts: the bundle's name,
   *  stamped back onto the scene so a re-save keeps it. */
  bundleName?: string | null;
  stage: {
    width: number;
    height: number;
  };
  stageBackgroundColor: string | null;
  /** Optional looping background-video reference. `blobKey` resolves to
   *  bytes BH stored in IndexedDB; null/absent = no background video. */
  backgroundVideo?: RhemaBackgroundVideo | null;
  backdropSvg: string | null;
  bindings: RhemaSceneBindings;
  textLayers: Array<{
    id: string;
    name: string;
    text: string;
    role: "scripture" | "reference" | "unmapped";
    /** Set when this layer was inserted from the stage palette. /live renders
     *  dynamic content (clock, countdown, etc.) by kind. */
    componentKind: RhemaComponentKind | null;
    style: RhemaTextLayerRuntimeStyle;
    frame: {
      x: number;
      y: number;
      width: number | null;
      height: number | null;
    };
  }>;
  /**
   * Per-node visibility rules — keyed by target node id (the node that
   * should be hidden/shown). Each rule references a SOURCE text node
   * id, plus a condition. v1 only applies these to text layers in the
   * runtime; shape-level visibility (e.g. lower-third PNG hiding) is
   * a follow-up that requires preserving node ids through the SVG
   * export pipeline.
   */
  visibilityRules: Record<string, RhemaVisibilityRule>;
  /** Workspace discriminator — "theme" (scripture rendering) or "stage" (confidence monitor). */
  workspace: RhemaWorkspace;
  /** Stage-only bindings (clock, next-layout). Empty when workspace === "theme". */
  stageBindings: RhemaStageBindings;
  /** Shape nodes whose effects the flat backdrop SVG can't represent
   *  (backdrop-blur / liquid-glass frost / procedural noise). BH renders these
   *  as live positioned DIVs over the SVG so frosted-glass + grain panels work
   *  on the live output. Drop-shadow / opacity / layer-blur are NOT here — the
   *  SVG export already handles those. */
  effectLayers: RhemaEffectLayer[];
};

/** A live-rendered shape panel (frosted glass / grain). Geometry is in STAGE
 *  coordinates (same space as textLayer frames + the backdrop SVG). */
export type RhemaEffectLayer = {
  id: string;
  frame: { x: number; y: number; width: number; height: number };
  /** Backdrop blur radius in px (from fe_backdrop_blur, or fe_liquid_glass's
   *  radius as a frosted approximation — true liquid glass is shader-only). */
  backdropBlur: number | null;
  /** Procedural grain overlay: CSS colour + 0..1 opacity, or null. */
  noise: { color: string; opacity: number } | null;
  /** Corner radius in px (rounded panel). */
  cornerRadius: number;
  /** True when the source effect was liquid-glass → add a light highlight/border
   *  so the frosted approximation reads as glass. */
  frosted: boolean;
};

type BibleContentPayload = {
  reference: string;
  scripture: string;
  version?: string | null;
};

function getSceneUserdata(
  document: grida.program.document.Document,
  sceneId: string
): Record<string, unknown> {
  const metadata = document.metadata?.[sceneId];
  const userdata = metadata?.userdata;
  return userdata && typeof userdata === "object"
    ? (userdata as Record<string, unknown>)
    : {};
}

function collectSceneTextNodes(
  document: grida.program.document.Document,
  sceneId: string
): Array<grida.program.nodes.TextSpanNode> {
  const sceneChildren = document.links[sceneId] ?? [];
  const queue = [...sceneChildren];
  const textNodes: Array<grida.program.nodes.TextSpanNode> = [];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = document.nodes[nodeId];
    if (!node) continue;
    if (node.type === "tspan") {
      textNodes.push(node);
    }
    const children = document.links[nodeId] ?? [];
    if (children.length > 0) {
      queue.push(...children);
    }
  }

  return textNodes;
}

function buildParentMap(
  document: grida.program.document.Document,
  sceneId: string
): Map<string, string | null> {
  const parentById = new Map<string, string | null>();
  const queue: Array<{ id: string; parent: string | null }> = [
    { id: sceneId, parent: null },
  ];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (parentById.has(current.id)) continue;
    parentById.set(current.id, current.parent);
    const children = document.links[current.id] ?? [];
    for (const childId of children) {
      queue.push({ id: childId, parent: current.id });
    }
  }
  return parentById;
}

function extractTextLayerFrame(
  document: grida.program.document.Document,
  sceneId: string,
  nodeId: string,
  parentById: Map<string, string | null>
): { x: number; y: number; width: number | null; height: number | null } {
  let x = 0;
  let y = 0;
  // Read width/height from the TEXT NODE ITSELF — never inherit from an
  // ancestor. Text nodes (tspan) have `layout_target_width: "auto"` (a
  // non-numeric string), and the previous greedy walk-up would pick up
  // the FIRST numeric width/height in the ancestor chain — which for
  // slide-workspace text means the stage container's full 1920x1080.
  // BH's `AuthoredTextLayer` then rendered the text inside a 1920x1080
  // flex box with alignItems:center+justifyContent:center, planting the
  // text at the BOX CENTER (= offset + 960, + 540) instead of at the
  // operator's chosen inset. Result: text shows up at the lower-right
  // edge of the stage on /live even though the editor places it
  // correctly. Operator-found regression 2026-05-28.
  //
  // Read the text node's own width/height before climbing the inset
  // chain; if it's "auto" (the T-tool default) leave null so
  // AuthoredTextLayer falls back to content-sized box.
  const textNode = document.nodes[nodeId] as unknown as
    | Record<string, unknown>
    | undefined;
  const width: number | null =
    textNode && typeof textNode.layout_target_width === "number"
      ? (textNode.layout_target_width as number)
      : null;
  const height: number | null =
    textNode && typeof textNode.layout_target_height === "number"
      ? (textNode.layout_target_height as number)
      : null;
  let currentId: string | null = nodeId;
  while (currentId && currentId !== sceneId) {
    const node = document.nodes[currentId] as unknown as
      | Record<string, unknown>
      | undefined;
    if (!node) break;
    if (typeof node.layout_inset_left === "number") x += node.layout_inset_left;
    if (typeof node.layout_inset_top === "number") y += node.layout_inset_top;
    currentId = parentById.get(currentId) ?? null;
  }
  return { x, y, width, height };
}

function resolveNodeIdByPreferredName(
  nodes: Array<grida.program.nodes.TextSpanNode>,
  names: string[]
): string | null {
  const lowered = names.map((name) => name.toLowerCase());
  const hit = nodes.find((node) => {
    const n = (node.name ?? "").trim().toLowerCase();
    return lowered.includes(n);
  });
  return hit?.id ?? null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeColorChannel(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 1) return Math.round(clamp01(value) * 255);
  return Math.round(Math.max(0, Math.min(255, value)));
}

function rgbaRecordToCss(record: Record<string, unknown>): string | null {
  const r = normalizeColorChannel(record.r);
  const g = normalizeColorChannel(record.g);
  const b = normalizeColorChannel(record.b);
  if (r === null || g === null || b === null) return null;
  const alphaRaw = typeof record.a === "number" ? record.a : 1;
  const alpha = alphaRaw <= 1 ? clamp01(alphaRaw) : clamp01(alphaRaw / 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function paintToCss(paint: unknown): string | null {
  if (!paint || typeof paint !== "object") return null;
  const obj = paint as Record<string, unknown>;
  if (obj.active === false) return null;
  if (obj.type === "solid" && obj.color && typeof obj.color === "object") {
    return rgbaRecordToCss(obj.color as Record<string, unknown>);
  }
  if ("r" in obj && "g" in obj && "b" in obj) {
    return rgbaRecordToCss(obj);
  }
  return null;
}

function resolveNodeFillColor(node: Record<string, unknown>): string | null {
  if (Array.isArray(node.fill_paints) && node.fill_paints.length > 0) {
    for (let i = node.fill_paints.length - 1; i >= 0; i -= 1) {
      const color = paintToCss(node.fill_paints[i]);
      if (color) return color;
    }
  }
  return paintToCss(node.fill);
}

/** Stroke colour — mirrors resolveNodeFillColor but reads the stroke paint(s). */
function resolveNodeStrokeColor(node: Record<string, unknown>): string | null {
  if (Array.isArray(node.stroke_paints) && node.stroke_paints.length > 0) {
    for (let i = node.stroke_paints.length - 1; i >= 0; i -= 1) {
      const color = paintToCss(node.stroke_paints[i]);
      if (color) return color;
    }
  }
  return paintToCss(node.stroke);
}

function resolveNodeStrokeWidth(node: Record<string, unknown>): number | null {
  return typeof node.stroke_width === "number" && node.stroke_width > 0
    ? node.stroke_width
    : null;
}

/** Build a CSS `text-shadow` string from the node's drop shadows (fe_shadows).
 *  Skips inset shadows (text-shadow has no inset). spread is ignored (text-shadow
 *  has no spread). Returns null when there are no usable shadows. */
function resolveNodeTextShadow(node: Record<string, unknown>): string | null {
  const shadows = node.fe_shadows;
  if (!Array.isArray(shadows) || shadows.length === 0) return null;
  const parts: string[] = [];
  for (const raw of shadows) {
    if (!raw || typeof raw !== "object") continue;
    const sh = raw as Record<string, unknown>;
    if (sh.inset === true) continue;
    const color = sh.color
      ? rgbaRecordToCss(sh.color as Record<string, unknown>)
      : null;
    if (!color) continue;
    const offset = Array.isArray(sh.offset) ? sh.offset : [0, 0];
    const dx = typeof offset[0] === "number" ? offset[0] : 0;
    const dy = typeof offset[1] === "number" ? offset[1] : 0;
    const blur = typeof sh.blur === "number" ? sh.blur : 0;
    parts.push(`${dx}px ${dy}px ${blur}px ${color}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function readFromNodeAncestry<T>(
  document: grida.program.document.Document,
  sceneId: string,
  nodeId: string,
  parentById: Map<string, string | null>,
  resolver: (node: Record<string, unknown>) => T | null
): T | null {
  let currentId: string | null = nodeId;
  while (currentId) {
    const node = document.nodes[currentId] as unknown as
      | Record<string, unknown>
      | undefined;
    if (!node) break;
    const resolved = resolver(node);
    if (resolved !== null && resolved !== undefined) return resolved;
    if (currentId === sceneId) break;
    currentId = parentById.get(currentId) ?? null;
  }
  return null;
}

/** Full computed React text CSS for a node via the SAME converter the editor
 *  canvas uses, so the live output matches every text feature. fontSize + color
 *  are stripped (owned by BH autosize / the structured color field). Returns
 *  only serialisable string/number props; null on any failure. */
function extractReactTextCss(
  document: grida.program.document.Document,
  nodeId: string
): Record<string, string | number> | null {
  const node = document.nodes[nodeId] as unknown;
  if (!node || typeof node !== "object") return null;
  let reactStyle: Record<string, unknown>;
  try {
    reactStyle = css.toReactTextStyle(
      node as unknown as Parameters<typeof css.toReactTextStyle>[0]
    ) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(reactStyle)) {
    if (k === "fontSize" || k === "color") continue;
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function extractLayerRuntimeStyle(
  document: grida.program.document.Document,
  sceneId: string,
  nodeId: string,
  parentById: Map<string, string | null>
): RhemaTextLayerRuntimeStyle {
  const textAlignRaw = readFromNodeAncestry(
    document,
    sceneId,
    nodeId,
    parentById,
    (node) => {
      const align = node.text_align;
      return align === "left" ||
        align === "center" ||
        align === "right" ||
        align === "justify"
        ? align
        : null;
    }
  );
  const fontStyle = readFromNodeAncestry(
    document,
    sceneId,
    nodeId,
    parentById,
    (node) => {
      if (node.font_style_italic === true) return "italic";
      const raw = node.font_style;
      return typeof raw === "string" && raw.trim() ? raw : null;
    }
  );
  return {
    color: readFromNodeAncestry(document, sceneId, nodeId, parentById, (node) =>
      resolveNodeFillColor(node)
    ),
    fontFamily: readFromNodeAncestry(
      document,
      sceneId,
      nodeId,
      parentById,
      (node) => (typeof node.font_family === "string" ? node.font_family : null)
    ),
    fontSize: readFromNodeAncestry(
      document,
      sceneId,
      nodeId,
      parentById,
      (node) => (typeof node.font_size === "number" ? node.font_size : null)
    ),
    fontWeight: readFromNodeAncestry(
      document,
      sceneId,
      nodeId,
      parentById,
      (node) =>
        typeof node.font_weight === "number" ||
        typeof node.font_weight === "string"
          ? node.font_weight
          : null
    ),
    fontStyle,
    lineHeight: readFromNodeAncestry(
      document,
      sceneId,
      nodeId,
      parentById,
      (node) => (typeof node.line_height === "number" ? node.line_height : null)
    ),
    letterSpacing: readFromNodeAncestry(
      document,
      sceneId,
      nodeId,
      parentById,
      (node) =>
        typeof node.letter_spacing === "number" ? node.letter_spacing : null
    ),
    textAlign: textAlignRaw,
    strokeColor: readFromNodeAncestry(
      document,
      sceneId,
      nodeId,
      parentById,
      (node) => resolveNodeStrokeColor(node)
    ),
    strokeWidth: readFromNodeAncestry(
      document,
      sceneId,
      nodeId,
      parentById,
      (node) => resolveNodeStrokeWidth(node)
    ),
    textShadow: readFromNodeAncestry(
      document,
      sceneId,
      nodeId,
      parentById,
      (node) => resolveNodeTextShadow(node)
    ),
    css: extractReactTextCss(document, nodeId),
  };
}

function resolveStageMeta(
  document: grida.program.document.Document,
  sceneId: string
): { width: number; height: number; backgroundColor: string | null } {
  const sceneChildren = document.links[sceneId] ?? [];
  for (const childId of sceneChildren) {
    const node = document.nodes[childId];
    if (!node || node.type !== "container") continue;
    const c = node as unknown as Record<string, unknown>;
    const width = c.layout_target_width;
    const height = c.layout_target_height;
    const likelyStage =
      (typeof c.name === "string" && c.name.toLowerCase().includes("canvas")) ||
      (typeof width === "number" &&
        width >= 1280 &&
        typeof height === "number" &&
        height >= 720);
    if (!likelyStage) continue;
    return {
      width: typeof width === "number" && width > 0 ? width : 1920,
      height: typeof height === "number" && height > 0 ? height : 1080,
      backgroundColor: resolveNodeFillColor(c),
    };
  }
  return { width: 1920, height: 1080, backgroundColor: null };
}

export function stripTextFromSvg(svg: string): string {
  if (!svg.trim()) return svg;
  return svg
    .replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, "")
    .replace(/<tspan\b[^>]*>[\s\S]*?<\/tspan>/gi, "");
}

export function getRhemaSceneBindings(
  document: grida.program.document.Document,
  sceneId: string
): RhemaSceneBindings {
  const userdata = getSceneUserdata(document, sceneId);
  const textNodes = collectSceneTextNodes(document, sceneId);

  const scriptureRaw = userdata[RHEMA_SCRIPTURE_BINDING_KEY];
  const referenceRaw = userdata[RHEMA_REFERENCE_BINDING_KEY];
  const includeVersionRaw = userdata[RHEMA_REFERENCE_INCLUDE_VERSION_KEY];

  const hasNode = (nodeId: string) => textNodes.some((n) => n.id === nodeId);

  const scriptureNodeId =
    typeof scriptureRaw === "string" && hasNode(scriptureRaw)
      ? scriptureRaw
      : resolveNodeIdByPreferredName(textNodes, ["scripture", "verse"]);

  const referenceNodeId =
    typeof referenceRaw === "string" && hasNode(referenceRaw)
      ? referenceRaw
      : resolveNodeIdByPreferredName(textNodes, ["reference", "ref"]);

  const includeVersionInReference =
    typeof includeVersionRaw === "boolean" ? includeVersionRaw : true;

  return {
    scriptureNodeId,
    referenceNodeId,
    includeVersionInReference,
  };
}

/**
 * Read the workspace stamped on a scene's userdata. Falls back to
 * "theme" so legacy scenes (no field) keep their original behavior.
 */
export function getRhemaWorkspace(
  document: grida.program.document.Document,
  sceneId: string
): RhemaWorkspace {
  const userdata = getSceneUserdata(document, sceneId);
  const raw = userdata[RHEMA_WORKSPACE_KEY];
  if (raw === "stage") return "stage";
  if (raw === "slide") return "slide";
  return "theme";
}

/**
 * Read the background-video reference stamped on a scene's userdata.
 * Returns null when the scene has no clip selected, or when the stored
 * value is malformed (missing a string blobKey).
 */
export function getRhemaBackgroundVideo(
  document: grida.program.document.Document,
  sceneId: string
): RhemaBackgroundVideo | null {
  const userdata = getSceneUserdata(document, sceneId);
  const raw = userdata[RHEMA_BACKGROUND_VIDEO_KEY];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.blobKey !== "string" || !r.blobKey.trim()) return null;
  return {
    blobKey: r.blobKey,
    name: typeof r.name === "string" ? r.name : undefined,
    mimeType: typeof r.mimeType === "string" ? r.mimeType : undefined,
  };
}

/**
 * Resolve the stage-only bindings (clock, next layout) for a scene.
 * Returns nulls for entries that don't map to a valid text node.
 */
export function getRhemaStageBindings(
  document: grida.program.document.Document,
  sceneId: string
): RhemaStageBindings {
  const userdata = getSceneUserdata(document, sceneId);
  const textNodes = collectSceneTextNodes(document, sceneId);
  const hasNode = (id: string) => textNodes.some((n) => n.id === id);
  const clockRaw = userdata[RHEMA_CLOCK_BINDING_KEY];
  const nextLayoutRaw = userdata[RHEMA_NEXT_LAYOUT_BINDING_KEY];
  return {
    clockNodeId:
      typeof clockRaw === "string" && hasNode(clockRaw) ? clockRaw : null,
    nextLayoutNodeId:
      typeof nextLayoutRaw === "string" && hasNode(nextLayoutRaw)
        ? nextLayoutRaw
        : null,
  };
}

/** Collect shape nodes carrying effects the flat backdrop SVG can't represent
 *  (backdrop-blur, liquid-glass frost, procedural noise) so BH can render them
 *  as live DIVs. Drop-shadow/opacity/layer-blur are intentionally excluded —
 *  Grida's SVG export already bakes those. */
function extractEffectLayers(
  document: grida.program.document.Document,
  sceneId: string,
  parentById: Map<string, string | null>
): RhemaEffectLayer[] {
  const out: RhemaEffectLayer[] = [];
  for (const nodeId of collectAllSceneNodeIds(document, sceneId)) {
    const node = document.nodes[nodeId] as unknown as
      | Record<string, unknown>
      | undefined;
    if (!node || typeof node !== "object") continue;
    if (node.type === "text") continue; // text styling handled separately

    const bd = node.fe_backdrop_blur as Record<string, unknown> | undefined;
    const lg = node.fe_liquid_glass as Record<string, unknown> | undefined;
    const noiseRaw = node.fe_noise as Record<string, unknown> | undefined;

    const backdropBlur =
      bd && typeof bd.radius === "number" && bd.radius > 0
        ? bd.radius
        : lg && typeof lg.radius === "number" && lg.radius > 0
          ? lg.radius
          : null;
    const noise =
      noiseRaw && noiseRaw.color
        ? {
            color:
              rgbaRecordToCss(noiseRaw.color as Record<string, unknown>) ??
              "rgba(0,0,0,0.15)",
            opacity:
              typeof noiseRaw.density === "number"
                ? Math.max(0.05, Math.min(1, noiseRaw.density))
                : 0.3,
          }
        : null;

    if (backdropBlur === null && !noise) continue; // nothing live to render

    const frame = extractTextLayerFrame(document, sceneId, nodeId, parentById);
    if (frame.width === null || frame.height === null) continue; // need geometry

    out.push({
      id: nodeId,
      frame: {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
      },
      backdropBlur,
      noise,
      cornerRadius:
        typeof node.corner_radius === "number" ? node.corner_radius : 0,
      frosted: !!lg,
    });
  }
  return out;
}

export function buildRhemaThemeRuntimeJson(
  document: grida.program.document.Document,
  sceneId: string
): RhemaThemeRuntimeJson {
  const scene = document.nodes[sceneId];
  if (!scene || scene.type !== "scene") {
    throw new Error(`Scene '${sceneId}' does not exist.`);
  }

  const bindings = getRhemaSceneBindings(document, sceneId);
  const textNodes = collectSceneTextNodes(document, sceneId);
  const parentById = buildParentMap(document, sceneId);
  const stage = resolveStageMeta(document, sceneId);

  // Collect per-node visibility rules. We walk every node reachable
  // from the scene (text + shape) and read its userData. A rule is
  // valid only when its sourceTextNodeId exists in textNodes — stale
  // rules pointing at deleted/renamed nodes are dropped so the
  // runtime doesn't have to defensively filter again.
  const textNodeIds = new Set(textNodes.map((n) => n.id));
  const visibilityRules: Record<string, RhemaVisibilityRule> = {};
  for (const nodeId of collectAllSceneNodeIds(document, sceneId)) {
    const ud = document.metadata?.[nodeId]?.userdata as
      | Record<string, unknown>
      | undefined;
    if (!ud) continue;
    const raw = ud[RHEMA_VISIBILITY_RULE_KEY];
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const condition = r.condition;
    const sourceTextNodeId = r.sourceTextNodeId;
    if (condition !== "has-text" && condition !== "is-empty") continue;
    if (typeof sourceTextNodeId !== "string" || !sourceTextNodeId.trim())
      continue;
    if (!textNodeIds.has(sourceTextNodeId)) continue;
    visibilityRules[nodeId] = { condition, sourceTextNodeId };
  }

  return {
    kind: "rhema-theme-runtime",
    version: 1,
    scene: {
      id: sceneId,
      name: scene.name ?? "Theme",
    },
    stage: { width: stage.width, height: stage.height },
    stageBackgroundColor: stage.backgroundColor,
    backgroundVideo: getRhemaBackgroundVideo(document, sceneId),
    backdropSvg: null,
    bindings,
    textLayers: textNodes.map((node) => {
      const role =
        node.id === bindings.scriptureNodeId
          ? "scripture"
          : node.id === bindings.referenceNodeId
            ? "reference"
            : "unmapped";
      // Component kind stamped by the stage palette insert. Round-trips
      // to BH's runtime so /live can swap text for live data sources.
      const nodeUserdata =
        (document.metadata?.[node.id]?.userdata as
          | Record<string, unknown>
          | undefined) ?? null;
      const kindRaw = nodeUserdata?.[RHEMA_COMPONENT_KIND_KEY];
      const componentKind: RhemaComponentKind | null =
        kindRaw === "scripture" ||
        kindRaw === "reference" ||
        kindRaw === "next-up" ||
        kindRaw === "next-slide-text" ||
        kindRaw === "clock" ||
        kindRaw === "segment-timer" ||
        kindRaw === "video-countdown" ||
        kindRaw === "audio-countdown" ||
        kindRaw === "preshow-countdown" ||
        kindRaw === "stage-message" ||
        kindRaw === "slide-notes" ||
        kindRaw === "screen-preview"
          ? kindRaw
          : null;
      return {
        id: node.id,
        name: node.name ?? "Text",
        text: typeof node.text === "string" ? node.text : "",
        role,
        componentKind,
        style: extractLayerRuntimeStyle(document, sceneId, node.id, parentById),
        frame: extractTextLayerFrame(document, sceneId, node.id, parentById),
      };
    }),
    visibilityRules,
    workspace: getRhemaWorkspace(document, sceneId),
    stageBindings: getRhemaStageBindings(document, sceneId),
    effectLayers: extractEffectLayers(document, sceneId, parentById),
  };
}

/**
 * Walk every descendant id reachable from `sceneId` via `document.links`.
 * Used for collecting visibility-rule userdata on shapes AND text alike
 * (text-only walks already exist in `collectSceneTextNodes`).
 */
function collectAllSceneNodeIds(
  document: grida.program.document.Document,
  sceneId: string
): string[] {
  const out: string[] = [];
  const stack = [...(document.links?.[sceneId] ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    out.push(id);
    const children = document.links?.[id];
    if (children?.length) stack.push(...children);
  }
  return out;
}

export function formatRhemaReferenceText(
  reference: string,
  version: string | null | undefined,
  includeVersionInReference: boolean
): string {
  const base = reference.trim();
  if (!includeVersionInReference) return base;
  const v = (version ?? "").trim();
  if (!v) return base;
  return `${base} (${v})`;
}

export function applyRhemaContentToDocument(
  document: grida.program.document.Document,
  sceneId: string,
  payload: BibleContentPayload
): {
  nextDocument: grida.program.document.Document;
  applied: {
    scriptureNodeId: string | null;
    referenceNodeId: string | null;
  };
} {
  const bindings = getRhemaSceneBindings(document, sceneId);
  const nextDocument = structuredClone(document);

  if (bindings.scriptureNodeId) {
    const node = nextDocument.nodes[bindings.scriptureNodeId];
    if (node && node.type === "tspan") {
      node.text = payload.scripture;
    }
  }

  if (bindings.referenceNodeId) {
    const node = nextDocument.nodes[bindings.referenceNodeId];
    if (node && node.type === "tspan") {
      node.text = formatRhemaReferenceText(
        payload.reference,
        payload.version,
        bindings.includeVersionInReference
      );
    }
  }

  return {
    nextDocument,
    applied: {
      scriptureNodeId: bindings.scriptureNodeId,
      referenceNodeId: bindings.referenceNodeId,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Inverse of buildRhemaThemeRuntimeJson: materialize a Grida document
// from a stored theme payload (RhemaThemeRuntimeJson / BH GlobalTheme).
//
// WHY: the editor loads ONLY its own per-room OPFS document. Themes
// authored in BH code (builtin defaults) or freshly-cloned private slide
// themes have no OPFS document, so opening "Edit" showed a BLANK canvas.
// When the room is empty, BH posts the stored theme JSON and the editor
// seeds itself from it (playground load-effect hook). This is the
// STRUCTURAL inverse: scene -> stage container -> one tspan per text
// layer, carrying the same inset-based positioning, paint/stroke/shadow
// fields, and metadata.userdata binding keys the extractor reads — so
// buildRhemaThemeRuntimeJson(materialize(theme)) reproduces `theme`.
//
// Backdrop shapes (theme.backdropSvg) are reconstructed at RUNTIME via
// the editor's createNodeFromSvg (the inverse of the SVG export used on
// save) — they need the WASM decoder, so they are NOT built here; this
// pure function owns the scene/stage/text/binding skeleton.
// ─────────────────────────────────────────────────────────────────────

type MaterializedRgba = { r: number; g: number; b: number; a: number };

function to255Float(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n))) / 255;
}

/** Parse a CSS color (hex #rgb/#rrggbb/#rrggbbaa or rgb()/rgba()) into the
 *  RGBA32F {r,g,b,a} float(0..1) shape Grida paints use. null = unparseable. */
function cssColorToRgba(
  input: string | null | undefined
): MaterializedRgba | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith("#")) {
    const raw = s.slice(1);
    const full =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    if (full.length !== 6 && full.length !== 8) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return { r: r / 255, g: g / 255, b: b / 255, a };
  }
  const m = s.match(/^rgba?\(([^)]*)\)$/i);
  if (m) {
    const parts = m[1].split(",").map((p) => p.trim());
    if (parts.length < 3) return null;
    const r = Number.parseFloat(parts[0]);
    const g = Number.parseFloat(parts[1]);
    const b = Number.parseFloat(parts[2]);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    const aRaw = parts[3] !== undefined ? Number.parseFloat(parts[3]) : 1;
    return {
      r: to255Float(r),
      g: to255Float(g),
      b: to255Float(b),
      a: Number.isNaN(aRaw) ? 1 : Math.max(0, Math.min(1, aRaw)),
    };
  }
  return null;
}

function solidPaintFromCss(
  css: string | null | undefined
): { type: "solid"; color: MaterializedRgba; active: true } | null {
  const color = cssColorToRgba(css);
  return color ? { type: "solid", color, active: true } : null;
}

/** Split on top-level commas only (commas inside rgba(...) stay grouped). */
function splitTopLevelCommas(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      out.push(input.slice(start, i));
      start = i + 1;
    }
  }
  out.push(input.slice(start));
  return out.map((p) => p.trim()).filter(Boolean);
}

/** Inverse of resolveNodeTextShadow: a CSS `text-shadow` string ->
 *  Grida fe_shadows[]. Parses the "<dx>px <dy>px <blur>px <color>" form the
 *  exporter emits; anything else is skipped (best-effort, never throws). */
function parseTextShadowToFeShadows(
  textShadow: string | null | undefined
): Array<{
  color: MaterializedRgba;
  offset: [number, number];
  blur: number;
  inset: false;
}> {
  if (typeof textShadow !== "string" || !textShadow.trim()) return [];
  const out: Array<{
    color: MaterializedRgba;
    offset: [number, number];
    blur: number;
    inset: false;
  }> = [];
  for (const part of splitTopLevelCommas(textShadow)) {
    const m = part.match(/^(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(.+)$/);
    if (!m) continue;
    const color = cssColorToRgba(m[4]);
    if (!color) continue;
    out.push({
      color,
      offset: [Number.parseFloat(m[1]), Number.parseFloat(m[2])],
      blur: Number.parseFloat(m[3]),
      inset: false,
    });
  }
  return out;
}

/** One embedded backdrop photo extracted for seed reconstruction. */
export interface SeedBackdropImage {
  /** Original encoded bytes, untouched (data URI as shipped by BH's seed
   *  reply — inflate restores the operator's original JPEG/PNG bytes). */
  dataUri: string;
  /** Stage-space rect the image draw maps onto. */
  rect: { x: number; y: number; width: number; height: number };
  /** ImagePaint fit for the reconstructed rectangle. */
  fit: "fill" | "cover";
}

function svgAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`(?:^|\\s)(?:xlink:)?${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function svgNumAttr(tag: string, name: string): number | null {
  const raw = svgAttr(tag, name);
  if (raw === null) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract embedded photos (plus their stage-space geometry) from a backdrop
 * SVG BEFORE it is fed to `createNodeFromSvg`.
 *
 * Why: the wasm SVG import pipeline currently DROPS `<image>` nodes (usvg
 * import TODO in crates/grida/src/import/svg/packed_scene.rs), so a seeded
 * picture theme lost its photo in the editor — and because the next save
 * re-exports whatever the document holds, the photo was then permanently
 * deleted from the theme. The seed hook rebuilds extracted photos as native
 * image-fill rectangles (original encoded bytes registered via
 * `createImage`), which round-trip through the save exporter.
 *
 * Recognized shapes — both are OUR OWN exporter's output, not arbitrary SVG:
 *  - fit-aware export (2026-07-03+): `<defs><image .../></defs>` +
 *    `<use transform="matrix(a 0 0 d e f)" href="#img"/>` → rect at
 *    (e, f, a*W, d*H), fit "fill" (the matrix bakes the operator's fit).
 *  - legacy pattern export: `<pattern><image/></pattern>` +
 *    `<rect fill="url(#pattern)"/>` → the rect's geometry, fit "cover"
 *    (the semantic normalizeBackdropImageFit heals this shape to).
 *  - a direct `<image x y width height/>` outside defs → its own geometry,
 *    fit "fill".
 *
 * FAIL-CLOSED: any unrecognized construct (rotated/skewed matrices,
 * non-data-URI hrefs, images with no draw site) bails with NO extraction so
 * the previous behavior (whole SVG through createNodeFromSvg) is preserved.
 */
export function extractBackdropImagesForSeed(svg: string): {
  images: SeedBackdropImage[];
  /** SVG with the extracted image carriers removed; null when nothing
   *  paintable remains (skip createNodeFromSvg entirely). */
  remainderSvg: string | null;
} {
  const noExtraction = { images: [], remainderSvg: svg } as const;
  if (!svg || !svg.includes("<image")) return noExtraction;

  const rootTag = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const rootW = svgNumAttr(rootTag, "width");
  const rootH = svgNumAttr(rootTag, "height");
  const resolveLen = (
    raw: string | null,
    base: number | null
  ): number | null => {
    if (raw === null) return null;
    if (raw.endsWith("%")) {
      if (base === null) return null;
      const pct = Number.parseFloat(raw);
      return Number.isFinite(pct) ? (pct / 100) * base : null;
    }
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  };

  // ── collect every <image> tag with its span ──────────────────────────
  interface ImgTag {
    tag: string;
    start: number;
    end: number;
    id: string | null;
    dataUri: string;
    w: number;
    h: number;
  }
  const imgTags: ImgTag[] = [];
  const imgRe = /<image\b[^>]*\/?>/g;
  for (let m = imgRe.exec(svg); m; m = imgRe.exec(svg)) {
    const tag = m[0];
    const href = svgAttr(tag, "href");
    const w = svgNumAttr(tag, "width");
    const h = svgNumAttr(tag, "height");
    if (!href || !href.startsWith("data:image/") || w === null || h === null) {
      return noExtraction; // unrecognized image — fail closed
    }
    imgTags.push({
      tag,
      start: m.index,
      end: m.index + tag.length,
      id: tag.match(/(?:^|\s)id="([^"]*)"/)?.[1] ?? null,
      dataUri: href,
      w,
      h,
    });
  }
  if (imgTags.length === 0) return noExtraction;

  // Spans consumed by extraction (removed from the remainder).
  const consumed: Array<{ start: number; end: number }> = [];
  const found: Array<SeedBackdropImage & { order: number }> = [];
  const usedImg = new Set<ImgTag>();

  // ── pattern blocks (legacy shape) ─────────────────────────────────────
  const patternRe = /<pattern\b[^>]*>[\s\S]*?<\/pattern>/g;
  for (let m = patternRe.exec(svg); m; m = patternRe.exec(svg)) {
    const block = m[0];
    const inner = imgTags.find(
      (t) => t.start > m.index && t.end < m.index + block.length
    );
    if (!inner) continue;
    const patternId = block.match(/<pattern\b[^>]*?(?:^|\s)id="([^"]*)"/)?.[1];
    if (!patternId) return noExtraction;
    // The rect painted with this pattern.
    const rectRe = new RegExp(
      `<rect\\b[^>]*fill="url\\(#${patternId}\\)"[^>]*\\/?>`
    );
    const rectMatch = svg.match(rectRe);
    if (!rectMatch || rectMatch.index === undefined) return noExtraction;
    const rectTag = rectMatch[0];
    const w = resolveLen(svgAttr(rectTag, "width"), rootW);
    const h = resolveLen(svgAttr(rectTag, "height"), rootH);
    if (w === null || h === null) return noExtraction;
    found.push({
      order: rectMatch.index,
      dataUri: inner.dataUri,
      rect: {
        x: svgNumAttr(rectTag, "x") ?? 0,
        y: svgNumAttr(rectTag, "y") ?? 0,
        width: w,
        height: h,
      },
      fit: "cover",
    });
    usedImg.add(inner);
    consumed.push({ start: m.index, end: m.index + block.length });
    consumed.push({
      start: rectMatch.index,
      end: rectMatch.index + rectTag.length,
    });
  }

  // ── <use> references (fit-aware shape) ────────────────────────────────
  const useRe = /<use\b[^>]*\/?>/g;
  for (let m = useRe.exec(svg); m; m = useRe.exec(svg)) {
    const tag = m[0];
    const ref = svgAttr(tag, "href");
    if (!ref || !ref.startsWith("#")) continue;
    const img = imgTags.find((t) => t.id === ref.slice(1));
    if (!img || usedImg.has(img)) continue;
    const transform = svgAttr(tag, "transform");
    let a = 1,
      b = 0,
      c = 0,
      d = 1,
      e = 0,
      f = 0;
    if (transform) {
      const nums = transform
        .match(/matrix\(([^)]+)\)/)?.[1]
        ?.split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      if (!nums || nums.length !== 6 || nums.some((n) => !Number.isFinite(n))) {
        return noExtraction;
      }
      [a, b, c, d, e, f] = nums;
    }
    // Only axis-aligned, non-flipped placements are reconstructable as a
    // plain rect — anything else fails closed.
    if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6 || a <= 0 || d <= 0) {
      return noExtraction;
    }
    found.push({
      order: m.index,
      dataUri: img.dataUri,
      rect: { x: e, y: f, width: a * img.w, height: d * img.h },
      fit: "fill",
    });
    usedImg.add(img);
    consumed.push({ start: img.start, end: img.end });
    consumed.push({ start: m.index, end: m.index + tag.length });
  }

  // ── direct <image> draws (outside defs/pattern, unreferenced) ─────────
  const defsSpans: Array<{ start: number; end: number }> = [];
  const defsRe = /<defs\b[^>]*>[\s\S]*?<\/defs>/g;
  for (let m = defsRe.exec(svg); m; m = defsRe.exec(svg)) {
    defsSpans.push({ start: m.index, end: m.index + m[0].length });
  }
  for (const img of imgTags) {
    if (usedImg.has(img)) continue;
    const inDefs = defsSpans.some(
      (s) => img.start >= s.start && img.end <= s.end
    );
    if (inDefs) return noExtraction; // defs image nothing referenced — unknown construct
    found.push({
      order: img.start,
      dataUri: img.dataUri,
      rect: {
        x: svgNumAttr(img.tag, "x") ?? 0,
        y: svgNumAttr(img.tag, "y") ?? 0,
        width: img.w,
        height: img.h,
      },
      fit: "fill",
    });
    usedImg.add(img);
    consumed.push({ start: img.start, end: img.end });
  }

  if (found.length === 0) return noExtraction;

  // ── build the remainder ───────────────────────────────────────────────
  consumed.sort((x, y) => x.start - y.start);
  let remainder = "";
  let cursor = 0;
  for (const span of consumed) {
    if (span.start < cursor) continue; // nested/overlapping — already removed
    remainder += svg.slice(cursor, span.start);
    cursor = span.end;
  }
  remainder += svg.slice(cursor);
  remainder = remainder.replace(/<defs\b[^>]*>\s*<\/defs>/g, "");

  // Paintable check: anything visible left outside defs/clipPath?
  const probe = remainder
    .replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/g, "")
    .replace(/<clipPath\b[^>]*>[\s\S]*?<\/clipPath>/g, "");
  const paintable =
    /<(path|rect|circle|ellipse|polygon|polyline|line|text|image|foreignObject)\b/.test(
      probe
    );

  found.sort((x, y) => x.order - y.order);
  return {
    images: found.map(({ order: _order, ...img }) => img),
    remainderSvg: paintable ? remainder : null,
  };
}

export function materializeRhemaThemeDocument(theme: RhemaThemeRuntimeJson): {
  document: grida.program.document.Document;
  sceneId: string;
  /** The stage container node id — the seed hook reparents the reconstructed
   *  backdrop under it (behind the text) so it round-trips on the next save. */
  stageId: string;
} {
  // Honor the seed reply's scene id: BH resolves bundle rooms to the
  // DECOMPOSED scene id, and a bundle-layout room materialized as "main"
  // would mis-file its first save (single-scene doc overwriting the bundle
  // room's OPFS). Flat/builtin themes reply their own id, which the save
  // flow treats identically to "main".
  const replySceneId =
    typeof theme.scene?.id === "string" && theme.scene.id.trim()
      ? theme.scene.id.trim()
      : null;
  const sceneId = replySceneId ?? "main";
  const stageId = "rhema-stage";
  const stageWidth = theme.stage?.width ?? 1920;
  const stageHeight = theme.stage?.height ?? 1080;

  const nodes: Record<string, unknown> = {};
  const links: Record<string, string[]> = {};
  const metadata: Record<string, { userdata: Record<string, unknown> }> = {};

  // Scene — valid skeleton mirrored from distro EMPTY_DOCUMENT.
  nodes[sceneId] = {
    id: sceneId,
    type: "scene",
    name: theme.scene?.name ?? "Theme",
    active: true,
    locked: false,
    guides: [],
    edges: [],
    constraints: { children: "multiple" },
    background_color: { r: 0.96, g: 0.96, b: 0.96, a: 1 },
  };

  // Stage container — mirrors createRhemaStagePrototype. The theme's
  // stageBackgroundColor lives on the STAGE FILL (resolveStageMeta reads
  // the container fill, not the scene background_color).
  const stageFill = solidPaintFromCss(theme.stageBackgroundColor) ?? {
    type: "solid" as const,
    color: { r: 0, g: 0, b: 0, a: 0 },
    active: true as const,
  };
  nodes[stageId] = {
    id: stageId,
    type: "container",
    name: "Canvas 1920x1080",
    active: true,
    locked: false,
    opacity: 1,
    blend_mode: "normal",
    z_index: 0,
    rotation: 0,
    layout_positioning: "absolute",
    layout_inset_left: 0,
    layout_inset_top: 0,
    layout_target_width: stageWidth,
    layout_target_height: stageHeight,
    clips_content: true,
    corner_radius: 0,
    layout_mode: "flow",
    layout_direction: "horizontal",
    layout_main_axis_alignment: "start",
    layout_cross_axis_alignment: "start",
    layout_main_axis_gap: 0,
    layout_cross_axis_gap: 0,
    layout_padding_top: 0,
    layout_padding_right: 0,
    layout_padding_bottom: 0,
    layout_padding_left: 0,
    fill_paints: [stageFill],
    stroke_width: 1,
    stroke_align: "inside",
    stroke_cap: "butt",
    stroke_join: "miter",
  };

  const textIds: string[] = [];
  for (const layer of theme.textLayers ?? []) {
    const style = layer.style ?? ({} as RhemaTextLayerRuntimeStyle);
    const frame = layer.frame ?? { x: 0, y: 0, width: null, height: null };
    const node: Record<string, unknown> = {
      id: layer.id,
      type: "tspan",
      name: layer.name ?? "Text",
      active: true,
      locked: false,
      opacity: 1,
      blend_mode: "normal",
      z_index: 0,
      rotation: 0,
      layout_positioning: "absolute",
      layout_inset_left: frame.x ?? 0,
      layout_inset_top: frame.y ?? 0,
      layout_target_width:
        typeof frame.width === "number" ? frame.width : "auto",
      layout_target_height:
        typeof frame.height === "number" ? frame.height : "auto",
      // Empty design-time text (BH builtins ship "") would materialize an
      // INVISIBLE node — the operator still perceives the "blank canvas" the
      // seed exists to fix. Fall back to the layer name (Grida's own new-node
      // convention is placeholder text); BH pours live content into these
      // nodes by id at runtime, so design-time filler is inert.
      text:
        typeof layer.text === "string" && layer.text.trim()
          ? layer.text
          : (layer.name ?? "Text"),
      text_align: style.textAlign ?? "left",
      text_align_vertical: "top",
      stroke_align: "outside",
      stroke_width:
        typeof style.strokeWidth === "number" ? style.strokeWidth : 0,
      word_spacing: 0,
    };
    if (style.fontFamily) node.font_family = style.fontFamily;
    if (typeof style.fontSize === "number") node.font_size = style.fontSize;
    if (style.fontWeight !== null && style.fontWeight !== undefined)
      node.font_weight = style.fontWeight;
    if (style.fontStyle === "italic") node.font_style_italic = true;
    else if (typeof style.fontStyle === "string" && style.fontStyle)
      node.font_style = style.fontStyle;
    if (typeof style.lineHeight === "number")
      node.line_height = style.lineHeight;
    if (typeof style.letterSpacing === "number")
      node.letter_spacing = style.letterSpacing;
    const fill = solidPaintFromCss(style.color);
    if (fill) node.fill_paints = [fill];
    const stroke = solidPaintFromCss(style.strokeColor);
    if (stroke) node.stroke_paints = [stroke];
    const shadows = parseTextShadowToFeShadows(style.textShadow);
    if (shadows.length > 0) node.fe_shadows = shadows;

    nodes[layer.id] = node;
    links[layer.id] = [];
    textIds.push(layer.id);

    if (layer.componentKind) {
      metadata[layer.id] = {
        userdata: { [RHEMA_COMPONENT_KIND_KEY]: layer.componentKind },
      };
    }
  }

  links[sceneId] = [stageId];
  links[stageId] = textIds;

  // Scene userdata — workspace + bindings + include-version + bg video +
  // stage bindings. These are the keys getRhema*Bindings/Workspace read.
  const bindings = theme.bindings ?? {
    scriptureNodeId: null,
    referenceNodeId: null,
    includeVersionInReference: true,
  };
  const sceneUserdata: Record<string, unknown> = {
    [RHEMA_WORKSPACE_KEY]: theme.workspace ?? "theme",
    [RHEMA_REFERENCE_INCLUDE_VERSION_KEY]: bindings.includeVersionInReference,
    // First-class Rhema markers, matching what getRhemaStage stamps when it
    // creates a stage: WITHOUT rhema_profile the insert reducer's
    // auto-placement skip never engages on a SEEDED document, so anything
    // the operator inserted (photos, shapes) was packer-displaced.
    rhema_profile: "bible-helper",
    rhema_lock_to_stage: true,
    rhema_stage_node_id: stageId,
  };
  if (typeof theme.bundleName === "string" && theme.bundleName.trim()) {
    sceneUserdata[RHEMA_BUNDLE_NAME_KEY] = theme.bundleName.trim();
  }
  if (bindings.scriptureNodeId)
    sceneUserdata[RHEMA_SCRIPTURE_BINDING_KEY] = bindings.scriptureNodeId;
  if (bindings.referenceNodeId)
    sceneUserdata[RHEMA_REFERENCE_BINDING_KEY] = bindings.referenceNodeId;
  if (theme.backgroundVideo)
    sceneUserdata[RHEMA_BACKGROUND_VIDEO_KEY] = theme.backgroundVideo;
  const stageBindings = theme.stageBindings ?? {
    clockNodeId: null,
    nextLayoutNodeId: null,
  };
  if (stageBindings.clockNodeId)
    sceneUserdata[RHEMA_CLOCK_BINDING_KEY] = stageBindings.clockNodeId;
  if (stageBindings.nextLayoutNodeId)
    sceneUserdata[RHEMA_NEXT_LAYOUT_BINDING_KEY] =
      stageBindings.nextLayoutNodeId;
  metadata[sceneId] = { userdata: sceneUserdata };

  // Per-node visibility rules — keyed by the TARGET node id.
  for (const [targetId, rule] of Object.entries(theme.visibilityRules ?? {})) {
    if (!rule) continue;
    const existing = metadata[targetId]?.userdata ?? {};
    existing[RHEMA_VISIBILITY_RULE_KEY] = rule;
    metadata[targetId] = { userdata: existing };
  }

  const document = {
    scenes_ref: [sceneId],
    nodes,
    links,
    metadata,
  } as unknown as grida.program.document.Document;

  return { document, sceneId, stageId };
}
