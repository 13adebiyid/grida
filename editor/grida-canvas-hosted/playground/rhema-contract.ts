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

export type RhemaThemeRuntimeJson = {
  kind: "rhema-theme-runtime";
  version: 1;
  scene: {
    id: string;
    name: string;
  };
  bindings: RhemaSceneBindings;
  textLayers: Array<{
    id: string;
    name: string;
    text: string;
    role: "scripture" | "reference" | "unmapped";
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

  return {
    kind: "rhema-theme-runtime",
    version: 1,
    scene: {
      id: sceneId,
      name: scene.name ?? "Theme",
    },
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
