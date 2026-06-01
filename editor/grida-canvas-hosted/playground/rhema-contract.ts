import grida from "@grida/schema";

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
};

export type RhemaThemeRuntimeJson = {
  kind: "rhema-theme-runtime";
  version: 1;
  scene: {
    id: string;
    name: string;
  };
  stage: {
    width: number;
    height: number;
  };
  stageBackgroundColor: string | null;
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
