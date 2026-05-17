import grida from "@grida/schema";

export const RHEMA_SCRIPTURE_BINDING_KEY = "rhema_binding_scripture_node_id";
export const RHEMA_REFERENCE_BINDING_KEY = "rhema_binding_reference_node_id";
export const RHEMA_REFERENCE_INCLUDE_VERSION_KEY =
  "rhema_reference_include_version";

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
    style: RhemaTextLayerRuntimeStyle;
    frame: {
      x: number;
      y: number;
      width: number | null;
      height: number | null;
    };
  }>;
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
  let width: number | null = null;
  let height: number | null = null;
  let currentId: string | null = nodeId;
  while (currentId && currentId !== sceneId) {
    const node = document.nodes[currentId] as unknown as
      | Record<string, unknown>
      | undefined;
    if (!node) break;
    if (typeof node.layout_inset_left === "number") x += node.layout_inset_left;
    if (typeof node.layout_inset_top === "number") y += node.layout_inset_top;
    if (width === null && typeof node.layout_target_width === "number")
      width = node.layout_target_width;
    if (height === null && typeof node.layout_target_height === "number")
      height = node.layout_target_height;
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
      return {
        id: node.id,
        name: node.name ?? "Text",
        text: typeof node.text === "string" ? node.text : "",
        role,
        style: extractLayerRuntimeStyle(document, sceneId, node.id, parentById),
        frame: extractTextLayerFrame(document, sceneId, node.id, parentById),
      };
    }),
  };
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
