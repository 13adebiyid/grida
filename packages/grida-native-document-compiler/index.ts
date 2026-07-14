import cg from "@grida/cg";
import { compilerIO } from "@grida/io/compiler";
import grida from "@grida/schema";
import { validateAnimationRepository } from "../grida-animation";

export const NATIVE_COMPILER_VERSION = "1.3.0";
export const GRIDA_IMPORT_DOCUMENT_VERSION = 1 as const;
export const GRIDA_IMPORT_RANGE_UNIT = "utf16-code-units" as const;
export const NATIVE_COMPILER_CONTRACT_DESCRIPTOR =
  "GridaImportDocumentV1|scene,node(rectangle,ellipse,polygon,star,vector,text,image,video),animation-v1|utf16-code-units|sha256-assets|diagnostics-v1";
export const NATIVE_COMPILER_CONTRACT_HASH =
  "5e01862b8eae2003f35088cb0536bb1e5d7579a149e75ba8548a8675982f3304";

const SHA256_RE = /^[a-f0-9]{64}$/;
const LIMITS = Object.freeze({
  scenes: 4096,
  nodes: 100_000,
  assets: 10_000,
  animations: 10_000,
  nodesPerScene: 20_000,
  textCodeUnits: 2_000_000,
  runsPerText: 50_000,
  vectorPointsPerNode: 20_000,
  keyCodeUnits: 512,
  nameCodeUnits: 4096,
  stageDimension: 16_384,
  coordinateMagnitude: 10_000_000,
  assetBytes: 512 * 1024 * 1024,
  mediaSeconds: 7 * 24 * 60 * 60,
});

export type ImportColorV1 = { r: number; g: number; b: number; a: number };

export type ImportPaintV1 =
  | { kind: "solid"; color: ImportColorV1 }
  | {
      kind: "linear-gradient";
      start: { x: number; y: number };
      end: { x: number; y: number };
      stops: Array<{ offset: number; color: ImportColorV1 }>;
    };

export interface ImportTextStyleV1 {
  fontFamily?: string;
  fontSize: number;
  fontWeight?: number;
  italic?: boolean;
  underline?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  fill: ImportPaintV1;
}

export interface ImportFrameV1 {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
}

export interface ImportVectorNetworkV1 {
  vertices: Array<{ x: number; y: number }>;
  segments: Array<{
    a: number;
    b: number;
    ta: { x: number; y: number };
    tb: { x: number; y: number };
  }>;
}

interface ImportNodeBaseV1 {
  importKey: string;
  name: string;
  frame: ImportFrameV1;
  hidden?: boolean;
  locked?: boolean;
}

interface ImportShapeBaseV1 extends ImportNodeBaseV1 {
  fill?: ImportPaintV1;
  stroke?: ImportPaintV1;
  strokeWidth?: number;
  cornerRadius?: number;
}

export type ImportNodeV1 =
  | (ImportShapeBaseV1 & { kind: "rectangle" })
  | (ImportShapeBaseV1 & {
      kind: "ellipse";
      startAngle?: number;
      sweepAngle?: number;
      innerRadius?: number;
    })
  | (ImportShapeBaseV1 & { kind: "polygon"; pointCount: number })
  | (ImportShapeBaseV1 & {
      kind: "star";
      pointCount: number;
      innerRadius: number;
    })
  | (ImportShapeBaseV1 & {
      kind: "vector";
      network: ImportVectorNetworkV1;
    })
  | (ImportNodeBaseV1 & {
      kind: "text";
      text: string;
      defaultStyle: ImportTextStyleV1;
      runs?: Array<{
        start: number;
        end: number;
        style: ImportTextStyleV1;
      }>;
      textAlign?: "left" | "center" | "right" | "justify";
      verticalAlign?: "top" | "center" | "bottom";
    })
  | (ImportNodeBaseV1 & {
      kind: "image";
      assetDigest: string;
      fit?: "contain" | "cover" | "fill";
    })
  | (ImportNodeBaseV1 & {
      kind: "video";
      assetDigest: string;
      posterDigest?: string;
      fit?: "contain" | "cover" | "fill";
      loop?: boolean;
      muted?: boolean;
      volume?: number;
      autoplay?: boolean;
      trimStartSeconds?: number;
      trimEndSeconds?: number;
      cornerRadius?: number;
    });

export interface ImportAssetV1 {
  importKey: string;
  digest: string;
  kind: "image" | "video" | "audio" | "other";
  mimeType: string;
  displayName: string;
  bytes: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  posterDigest?: string;
}

export interface ImportDiagnosticV1 {
  code: string;
  severity: "info" | "warning" | "error";
  capability: "render" | "edit" | "behavior" | "reimport";
  entityImportKey?: string;
  message: string;
}

export interface ImportAnimationV1 {
  importKey: string;
  sceneImportKey: string;
  targetNodeImportKey?: string;
  phase: grida.program.document.animation.Phase;
  trigger: grida.program.document.animation.Trigger;
  dependsOnImportKeys: string[];
  order: number;
  delaySeconds: number;
  durationSeconds: number;
  easing: grida.program.document.animation.Easing;
  fill: grida.program.document.animation.Fill;
  iterations: number;
  tracks: Array<{
    property: grida.program.document.animation.Property;
    from: number;
    to: number;
  }>;
  mediaAction: grida.program.document.animation.MediaAction;
  mediaValue: number;
  cueId?: string;
}

export interface GridaImportDocumentV1 {
  version: typeof GRIDA_IMPORT_DOCUMENT_VERSION;
  rangeUnit: typeof GRIDA_IMPORT_RANGE_UNIT;
  importKey: string;
  name: string;
  stage: { width: number; height: number };
  assets: ImportAssetV1[];
  scenes: Array<{
    importKey: string;
    name: string;
    background?: ImportPaintV1;
    nodes: ImportNodeV1[];
  }>;
  animations?: ImportAnimationV1[];
  diagnostics?: ImportDiagnosticV1[];
}

export interface NativeSourceMapV1 {
  version: 1;
  documentImportKey: string;
  scenes: Record<string, string>;
  nodes: Record<string, string>;
  assets: Record<string, string>;
  animations: Record<string, string>;
}

export interface NativeCompileResult {
  document: grida.program.document.Document;
  archive: Uint8Array;
  snapshotJson: string;
  sourceMap: NativeSourceMapV1;
  diagnostics: ImportDiagnosticV1[];
  semanticHash: string;
  archiveHash: string;
  schemaVersion: string;
  minimumReaderVersion: string;
  compilerVersion: string;
  contractHash: string;
}

export interface NativeCompileOptions {
  signal?: AbortSignal;
  onProgress?: (progress: { completed: number; total: number }) => void;
}

export class NativeDocumentCompileError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly entityImportKey?: string
  ) {
    super(message);
    this.name = "NativeDocumentCompileError";
  }
}

function fail(code: string, message: string, key?: string): never {
  throw new NativeDocumentCompileError(code, message, key);
}

function assertString(value: string, field: string, key?: string): void {
  if (!value || value.length > LIMITS.keyCodeUnits) {
    fail(
      "INVALID_IMPORT_KEY",
      `${field} must be 1-${LIMITS.keyCodeUnits} code units`,
      key
    );
  }
}

function assertName(value: string, field: string, key?: string): void {
  if (typeof value !== "string" || value.length > LIMITS.nameCodeUnits) {
    fail("INVALID_NAME", `${field} exceeds the supported length`, key);
  }
}

function finite(value: number, field: string, key?: string): number {
  if (!Number.isFinite(value))
    fail("NON_FINITE_NUMBER", `${field} must be finite`, key);
  return value;
}

function bounded(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
  key?: string
): number {
  finite(value, field, key);
  if (value < minimum || value > maximum) {
    fail(
      "NUMBER_OUT_OF_RANGE",
      `${field} is outside ${minimum}..${maximum}`,
      key
    );
  }
  return value;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException("Compilation aborted", "AbortError");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    fail("NON_FINITE_NUMBER", "Canonical data contains a non-finite number");
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : Uint8Array.from(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function nativeId(scope: string, importKey: string): Promise<string> {
  return `imp_${(await sha256(`${scope}\u0000${importKey}`)).slice(0, 32)}`;
}

function color(value: ImportColorV1, key?: string): cg.RGBA32F {
  return {
    r: bounded(value.r, 0, 1, "color.r", key),
    g: bounded(value.g, 0, 1, "color.g", key),
    b: bounded(value.b, 0, 1, "color.b", key),
    a: bounded(value.a, 0, 1, "color.a", key),
  } as cg.RGBA32F;
}

function paint(value: ImportPaintV1, key?: string): cg.Paint {
  if (value.kind === "solid") {
    return { type: "solid", color: color(value.color, key), active: true };
  }
  if (value.stops.length < 2 || value.stops.length > 256) {
    fail("INVALID_GRADIENT", "linear gradient requires 2-256 stops", key);
  }
  return {
    type: "linear_gradient",
    xy1: [
      finite(value.start.x, "gradient.start.x", key),
      finite(value.start.y, "gradient.start.y", key),
    ],
    xy2: [
      finite(value.end.x, "gradient.end.x", key),
      finite(value.end.y, "gradient.end.y", key),
    ],
    transform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    stops: value.stops.map((stop) => ({
      offset: bounded(stop.offset, 0, 1, "gradient.stop.offset", key),
      color: color(stop.color, key),
    })),
    blend_mode: "normal",
    opacity: 1,
    active: true,
  };
}

function textStyle(
  value: ImportTextStyleV1,
  key: string
): grida.program.nodes.i.ITextStyle {
  assertName(value.fontFamily ?? "", "fontFamily", key);
  return {
    font_family: value.fontFamily,
    font_size: bounded(value.fontSize, 0.1, 4096, "fontSize", key),
    font_weight: bounded(value.fontWeight ?? 400, 1, 1000, "fontWeight", key),
    font_kerning: true,
    font_style_italic: value.italic ?? false,
    text_decoration_line: value.underline ? "underline" : "none",
    letter_spacing:
      value.letterSpacing === undefined
        ? undefined
        : finite(value.letterSpacing, "letterSpacing", key),
    line_height:
      value.lineHeight === undefined
        ? undefined
        : bounded(value.lineHeight, 0, 100, "lineHeight", key),
  };
}

function frameTraits(node: ImportNodeV1, zIndex: number) {
  const frame = node.frame;
  return {
    active: !(node.hidden ?? false),
    locked: node.locked ?? false,
    opacity: bounded(frame.opacity ?? 1, 0, 1, "opacity", node.importKey),
    z_index: zIndex,
    rotation: finite(frame.rotation ?? 0, "rotation", node.importKey),
    layout_positioning: "absolute" as const,
    layout_inset_left: bounded(
      frame.x,
      -LIMITS.coordinateMagnitude,
      LIMITS.coordinateMagnitude,
      "x",
      node.importKey
    ),
    layout_inset_top: bounded(
      frame.y,
      -LIMITS.coordinateMagnitude,
      LIMITS.coordinateMagnitude,
      "y",
      node.importKey
    ),
    layout_target_width: bounded(
      frame.width,
      0,
      LIMITS.coordinateMagnitude,
      "width",
      node.importKey
    ),
    layout_target_height: bounded(
      frame.height,
      0,
      LIMITS.coordinateMagnitude,
      "height",
      node.importKey
    ),
  };
}

function shapeTraits(node: ImportShapeBaseV1) {
  return {
    fill: node.fill ? paint(node.fill, node.importKey) : undefined,
    fill_paints: node.fill ? [paint(node.fill, node.importKey)] : undefined,
    stroke: node.stroke ? paint(node.stroke, node.importKey) : undefined,
    stroke_paints: node.stroke
      ? [paint(node.stroke, node.importKey)]
      : undefined,
    stroke_width: bounded(
      node.strokeWidth ?? 0,
      0,
      100_000,
      "strokeWidth",
      node.importKey
    ),
    stroke_cap: "butt" as const,
    stroke_join: "miter" as const,
    corner_radius: bounded(
      node.cornerRadius ?? 0,
      0,
      LIMITS.coordinateMagnitude,
      "cornerRadius",
      node.importKey
    ),
  };
}

function isUniformText(node: Extract<ImportNodeV1, { kind: "text" }>): boolean {
  if (!node.runs || node.runs.length === 0) return true;
  return (
    node.runs.length === 1 &&
    node.runs[0]?.start === 0 &&
    node.runs[0]?.end === node.text.length &&
    stableStringify(node.runs[0].style) === stableStringify(node.defaultStyle)
  );
}

function validateRuns(node: Extract<ImportNodeV1, { kind: "text" }>): void {
  if (node.text.length > LIMITS.textCodeUnits) {
    fail(
      "TEXT_LIMIT_EXCEEDED",
      "text exceeds the compiler limit",
      node.importKey
    );
  }
  if (!node.runs || node.runs.length === 0) return;
  if (node.runs.length > LIMITS.runsPerText) {
    fail(
      "TEXT_RUN_LIMIT_EXCEEDED",
      "text run count exceeds the compiler limit",
      node.importKey
    );
  }
  let cursor = 0;
  for (const run of node.runs) {
    if (
      !Number.isSafeInteger(run.start) ||
      !Number.isSafeInteger(run.end) ||
      run.start !== cursor ||
      run.end <= run.start ||
      run.end > node.text.length
    ) {
      fail(
        "INVALID_TEXT_RUNS",
        "runs must be contiguous UTF-16 ranges covering the text",
        node.importKey
      );
    }
    cursor = run.end;
  }
  if (cursor !== node.text.length) {
    fail(
      "INVALID_TEXT_RUNS",
      "runs must cover the complete text",
      node.importKey
    );
  }
}

function vectorNetwork(node: Extract<ImportNodeV1, { kind: "vector" }>) {
  const { vertices, segments } = node.network;
  if (
    vertices.length < 2 ||
    vertices.length > LIMITS.vectorPointsPerNode ||
    segments.length < 1 ||
    segments.length > LIMITS.vectorPointsPerNode
  ) {
    fail(
      "INVALID_VECTOR_NETWORK",
      "vector network is empty or exceeds the compiler limit",
      node.importKey
    );
  }
  const outVertices = vertices.map(
    (vertex) =>
      [
        bounded(
          vertex.x,
          -LIMITS.coordinateMagnitude,
          LIMITS.coordinateMagnitude,
          "vertex.x",
          node.importKey
        ),
        bounded(
          vertex.y,
          -LIMITS.coordinateMagnitude,
          LIMITS.coordinateMagnitude,
          "vertex.y",
          node.importKey
        ),
      ] as [number, number]
  );
  const outSegments = segments.map((segment) => {
    if (
      !Number.isSafeInteger(segment.a) ||
      !Number.isSafeInteger(segment.b) ||
      segment.a < 0 ||
      segment.b < 0 ||
      segment.a >= vertices.length ||
      segment.b >= vertices.length ||
      segment.a === segment.b
    ) {
      fail(
        "INVALID_VECTOR_NETWORK",
        "vector segment references an invalid vertex",
        node.importKey
      );
    }
    return {
      a: segment.a,
      b: segment.b,
      ta: [
        finite(segment.ta.x, "segment.ta.x", node.importKey),
        finite(segment.ta.y, "segment.ta.y", node.importKey),
      ] as [number, number],
      tb: [
        finite(segment.tb.x, "segment.tb.x", node.importKey),
        finite(segment.tb.y, "segment.tb.y", node.importKey),
      ] as [number, number],
    };
  });
  return { vertices: outVertices, segments: outSegments };
}

async function compileNode(
  dto: GridaImportDocumentV1,
  sceneKey: string,
  node: ImportNodeV1,
  zIndex: number,
  assetByDigest: ReadonlyMap<string, ImportAssetV1>
): Promise<grida.program.nodes.Node> {
  assertString(node.importKey, "node.importKey", node.importKey);
  assertName(node.name, "node.name", node.importKey);
  const id = await nativeId(
    `${dto.importKey}/scene/${sceneKey}/node`,
    node.importKey
  );
  const base = { id, name: node.name, ...frameTraits(node, zIndex) };
  switch (node.kind) {
    case "rectangle":
      return {
        type: "rectangle",
        ...base,
        ...shapeTraits(node),
      } as grida.program.nodes.RectangleNode;
    case "ellipse":
      return {
        type: "ellipse",
        ...base,
        ...shapeTraits(node),
        angle_offset: finite(
          node.startAngle ?? 0,
          "startAngle",
          node.importKey
        ),
        angle: finite(node.sweepAngle ?? 360, "sweepAngle", node.importKey),
        inner_radius: bounded(
          node.innerRadius ?? 0,
          0,
          1,
          "innerRadius",
          node.importKey
        ),
      } as grida.program.nodes.EllipseNode;
    case "polygon":
      return {
        type: "polygon",
        ...base,
        ...shapeTraits(node),
        point_count: Math.trunc(
          bounded(node.pointCount, 3, 1024, "pointCount", node.importKey)
        ),
      } as grida.program.nodes.RegularPolygonNode;
    case "star":
      return {
        type: "star",
        ...base,
        ...shapeTraits(node),
        point_count: Math.trunc(
          bounded(node.pointCount, 3, 1024, "pointCount", node.importKey)
        ),
        inner_radius: bounded(
          node.innerRadius,
          0,
          1,
          "innerRadius",
          node.importKey
        ),
      } as grida.program.nodes.RegularStarPolygonNode;
    case "vector":
      return {
        type: "vector",
        ...base,
        ...shapeTraits(node),
        vector_network: vectorNetwork(node),
      } as grida.program.nodes.VectorNode;
    case "image": {
      const asset = assetByDigest.get(node.assetDigest);
      if (!asset || asset.kind !== "image") {
        fail(
          "INVALID_ASSET_REFERENCE",
          "image node references a missing or non-image asset",
          node.importKey
        );
      }
      const imagePaint: cg.ImagePaint = {
        type: "image",
        src: `res://images/${node.assetDigest}`,
        fit: node.fit ?? "cover",
        filters: {
          exposure: 0,
          contrast: 0,
          saturation: 0,
          temperature: 0,
          tint: 0,
          highlights: 0,
          shadows: 0,
        },
        blend_mode: "normal",
        opacity: 1,
        active: true,
      };
      return {
        type: "rectangle",
        ...base,
        fill: imagePaint,
        fill_paints: [imagePaint],
        stroke_width: 0,
        stroke_cap: "butt",
        stroke_join: "miter",
        corner_radius: 0,
      } as grida.program.nodes.RectangleNode;
    }
    case "video": {
      const asset = assetByDigest.get(node.assetDigest);
      if (!asset || asset.kind !== "video") {
        fail(
          "INVALID_ASSET_REFERENCE",
          "video node references a missing or non-video asset",
          node.importKey
        );
      }
      if (
        node.posterDigest !== undefined &&
        !SHA256_RE.test(node.posterDigest)
      ) {
        fail(
          "INVALID_ASSET_REFERENCE",
          "video poster reference is not a SHA-256 digest",
          node.importKey
        );
      }
      const trimStart = bounded(
        node.trimStartSeconds ?? 0,
        0,
        LIMITS.mediaSeconds,
        "trimStartSeconds",
        node.importKey
      );
      const trimEnd = node.trimEndSeconds ?? -1;
      if (
        !Number.isFinite(trimEnd) ||
        trimEnd < -1 ||
        trimEnd > LIMITS.mediaSeconds ||
        (trimEnd >= 0 && trimEnd <= trimStart)
      ) {
        fail(
          "INVALID_VIDEO_TRIM",
          "video trim end must be -1 or greater than trim start",
          node.importKey
        );
      }
      return {
        type: "video",
        ...base,
        src: `res://videos/${node.assetDigest}`,
        asset_digest: node.assetDigest,
        ...(node.posterDigest
          ? {
              poster: `res://images/${node.posterDigest}`,
              poster_asset_digest: node.posterDigest,
            }
          : {}),
        fit: node.fit ?? "cover",
        corner_radius: bounded(
          node.cornerRadius ?? 0,
          0,
          LIMITS.stageDimension,
          "cornerRadius",
          node.importKey
        ),
        loop: node.loop ?? true,
        muted: node.muted ?? true,
        volume: bounded(node.volume ?? 0, 0, 1, "volume", node.importKey),
        autoplay: node.autoplay ?? true,
        trim_start_seconds: trimStart,
        trim_end_seconds: trimEnd,
      } as grida.program.nodes.VideoNode;
    }
    case "text": {
      validateRuns(node);
      const defaultStyle = textStyle(node.defaultStyle, node.importKey);
      const defaultFill = paint(node.defaultStyle.fill, node.importKey);
      if (isUniformText(node)) {
        return {
          type: "tspan",
          ...base,
          text: node.text,
          ...defaultStyle,
          fill: defaultFill,
          fill_paints: [defaultFill],
          text_align: node.textAlign ?? "left",
          text_align_vertical: node.verticalAlign ?? "top",
          stroke_width: 0,
        } as grida.program.nodes.TextSpanNode;
      }
      return {
        type: "text",
        ...base,
        text: node.text,
        default_style: defaultStyle,
        styled_runs: (node.runs ?? []).map((run) => ({
          start: run.start,
          end: run.end,
          style: textStyle(run.style, node.importKey),
          fill_paints: [paint(run.style.fill, node.importKey)],
        })),
        fill_paints: [defaultFill],
        text_align: node.textAlign ?? "left",
        text_align_vertical: node.verticalAlign ?? "top",
        stroke_width: 0,
      } as grida.program.nodes.AttributedTextNode;
    }
  }
}

function validateAsset(asset: ImportAssetV1): void {
  assertString(asset.importKey, "asset.importKey", asset.importKey);
  if (!SHA256_RE.test(asset.digest))
    fail(
      "INVALID_ASSET_DIGEST",
      "asset digest must be lowercase SHA-256",
      asset.importKey
    );
  assertName(asset.displayName, "asset.displayName", asset.importKey);
  if (!asset.mimeType || asset.mimeType.length > 255)
    fail("INVALID_ASSET_MIME", "asset MIME type is invalid", asset.importKey);
  bounded(asset.bytes, 0, LIMITS.assetBytes, "asset.bytes", asset.importKey);
  if (!Number.isSafeInteger(asset.bytes))
    fail(
      "INVALID_ASSET_SIZE",
      "asset byte length must be an integer",
      asset.importKey
    );
  if (asset.posterDigest !== undefined && !SHA256_RE.test(asset.posterDigest))
    fail(
      "INVALID_ASSET_DIGEST",
      "poster digest must be lowercase SHA-256",
      asset.importKey
    );
}

export async function compileNativeDocument(
  dto: GridaImportDocumentV1,
  options: NativeCompileOptions = {}
): Promise<NativeCompileResult> {
  checkAbort(options.signal);
  if (dto.version !== 1 || dto.rangeUnit !== GRIDA_IMPORT_RANGE_UNIT) {
    fail(
      "UNSUPPORTED_CONTRACT",
      "unsupported import DTO version or text range unit"
    );
  }
  assertString(dto.importKey, "document.importKey", dto.importKey);
  assertName(dto.name, "document.name", dto.importKey);
  bounded(
    dto.stage.width,
    1,
    LIMITS.stageDimension,
    "stage.width",
    dto.importKey
  );
  bounded(
    dto.stage.height,
    1,
    LIMITS.stageDimension,
    "stage.height",
    dto.importKey
  );
  if (dto.scenes.length < 1 || dto.scenes.length > LIMITS.scenes)
    fail(
      "SCENE_LIMIT_EXCEEDED",
      "document scene count is outside the supported range",
      dto.importKey
    );
  if (dto.assets.length > LIMITS.assets)
    fail(
      "ASSET_LIMIT_EXCEEDED",
      "document asset count exceeds the compiler limit",
      dto.importKey
    );
  if ((dto.animations?.length ?? 0) > LIMITS.animations)
    fail(
      "ANIMATION_LIMIT_EXCEEDED",
      "document animation count exceeds the compiler limit",
      dto.importKey
    );
  const totalNodes = dto.scenes.reduce(
    (sum, scene) => sum + scene.nodes.length,
    0
  );
  if (totalNodes > LIMITS.nodes)
    fail(
      "NODE_LIMIT_EXCEEDED",
      "document node count exceeds the compiler limit",
      dto.importKey
    );

  const sourceMap: NativeSourceMapV1 = {
    version: 1,
    documentImportKey: dto.importKey,
    scenes: {},
    nodes: {},
    assets: {},
    animations: {},
  };
  const externalAssets: NonNullable<
    grida.program.document.Document["external_assets"]
  > = {};
  const assetByDigest = new Map<string, ImportAssetV1>();
  const assetKeys = new Set<string>();
  for (const asset of dto.assets) {
    validateAsset(asset);
    if (assetKeys.has(asset.importKey) || assetByDigest.has(asset.digest))
      fail(
        "DUPLICATE_IMPORT_KEY",
        "asset import keys and digests must be unique",
        asset.importKey
      );
    assetKeys.add(asset.importKey);
    assetByDigest.set(asset.digest, asset);
    sourceMap.assets[asset.importKey] = asset.digest;
    externalAssets[asset.digest] = {
      digest: asset.digest,
      kind: asset.kind,
      mime_type: asset.mimeType,
      display_name: asset.displayName,
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
      duration_seconds: asset.durationSeconds,
      poster_digest: asset.posterDigest,
    };
  }

  const nodes: Record<string, grida.program.nodes.Node> = {};
  const links: Record<string, string[]> = {};
  const scenesRef: string[] = [];
  const sceneKeys = new Set<string>();
  const nodeScopedKeys = new Set<string>();
  const totalWork =
    totalNodes + dto.scenes.length + (dto.animations?.length ?? 0);
  let completed = 0;

  for (const sceneDto of dto.scenes) {
    checkAbort(options.signal);
    assertString(sceneDto.importKey, "scene.importKey", sceneDto.importKey);
    assertName(sceneDto.name, "scene.name", sceneDto.importKey);
    if (sceneKeys.has(sceneDto.importKey))
      fail(
        "DUPLICATE_IMPORT_KEY",
        "scene import keys must be unique",
        sceneDto.importKey
      );
    if (sceneDto.nodes.length > LIMITS.nodesPerScene)
      fail(
        "NODE_LIMIT_EXCEEDED",
        "scene node count exceeds the compiler limit",
        sceneDto.importKey
      );
    sceneKeys.add(sceneDto.importKey);
    const sceneId = await nativeId(
      `${dto.importKey}/scene`,
      sceneDto.importKey
    );
    const stageId = await nativeId(
      `${dto.importKey}/scene/${sceneDto.importKey}`,
      "$stage"
    );
    const sceneNode: grida.program.nodes.SceneNode = {
      type: "scene",
      id: sceneId,
      name: sceneDto.name,
      active: true,
      locked: false,
      guides: [],
      edges: [],
      constraints: { children: "multiple" },
      background_color:
        sceneDto.background?.kind === "solid"
          ? color(sceneDto.background.color, sceneDto.importKey)
          : null,
    };
    const stageNode: grida.program.nodes.ContainerNode = {
      type: "container",
      id: stageId,
      name: `Canvas ${dto.stage.width}x${dto.stage.height}`,
      active: true,
      locked: false,
      clips_content: true,
      opacity: 1,
      z_index: 0,
      rotation: 0,
      layout_positioning: "absolute",
      layout_inset_left: 0,
      layout_inset_top: 0,
      layout_target_width: dto.stage.width,
      layout_target_height: dto.stage.height,
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
      stroke_width: 0,
      stroke_cap: "butt",
      stroke_join: "miter",
      fill: sceneDto.background
        ? paint(sceneDto.background, sceneDto.importKey)
        : undefined,
      fill_paints: sceneDto.background
        ? [paint(sceneDto.background, sceneDto.importKey)]
        : undefined,
    };
    nodes[sceneId] = sceneNode;
    nodes[stageId] = stageNode;
    links[sceneId] = [stageId];
    links[stageId] = [];
    scenesRef.push(sceneId);
    sourceMap.scenes[sceneDto.importKey] = sceneId;
    completed += 1;
    options.onProgress?.({ completed, total: totalWork });

    for (let index = 0; index < sceneDto.nodes.length; index += 1) {
      checkAbort(options.signal);
      const nodeDto = sceneDto.nodes[index]!;
      const scopedKey = `${sceneDto.importKey}\u0000${nodeDto.importKey}`;
      if (nodeScopedKeys.has(scopedKey))
        fail(
          "DUPLICATE_IMPORT_KEY",
          "node import keys must be unique within a scene",
          nodeDto.importKey
        );
      nodeScopedKeys.add(scopedKey);
      const node = await compileNode(
        dto,
        sceneDto.importKey,
        nodeDto,
        index,
        assetByDigest
      );
      nodes[node.id] = node;
      links[stageId]!.push(node.id);
      sourceMap.nodes[`${sceneDto.importKey}/${nodeDto.importKey}`] = node.id;
      completed += 1;
      options.onProgress?.({ completed, total: totalWork });
    }
  }

  const animations: grida.program.document.animation.Repository = {};
  const animationByImportKey = new Map<string, string>();
  for (const animation of dto.animations ?? []) {
    checkAbort(options.signal);
    assertString(
      animation.importKey,
      "animation.importKey",
      animation.importKey
    );
    assertString(
      animation.sceneImportKey,
      "animation.sceneImportKey",
      animation.importKey
    );
    if (animationByImportKey.has(animation.importKey)) {
      fail(
        "DUPLICATE_IMPORT_KEY",
        "animation import keys must be unique",
        animation.importKey
      );
    }
    const id = await nativeId(
      `${dto.importKey}/animation`,
      animation.importKey
    );
    animationByImportKey.set(animation.importKey, id);
    sourceMap.animations[animation.importKey] = id;
  }
  for (const animation of dto.animations ?? []) {
    checkAbort(options.signal);
    const id = animationByImportKey.get(animation.importKey)!;
    const sceneId = sourceMap.scenes[animation.sceneImportKey];
    if (!sceneId) {
      fail(
        "ANIMATION_SCENE_MISSING",
        "animation references a missing scene import key",
        animation.importKey
      );
    }
    const targetNodeId = animation.targetNodeImportKey
      ? sourceMap.nodes[
          `${animation.sceneImportKey}/${animation.targetNodeImportKey}`
        ]
      : undefined;
    if (animation.targetNodeImportKey && !targetNodeId) {
      fail(
        "ANIMATION_TARGET_MISSING",
        "animation references a missing node import key",
        animation.importKey
      );
    }
    const dependencyIds = animation.dependsOnImportKeys.map((dependency) => {
      const dependencyId = animationByImportKey.get(dependency);
      if (!dependencyId) {
        fail(
          "ANIMATION_DEPENDENCY_MISSING",
          `animation dependency '${dependency}' is missing`,
          animation.importKey
        );
      }
      return dependencyId;
    });
    const order = bounded(
      animation.order,
      0,
      1_000_000,
      "animation.order",
      animation.importKey
    );
    const iterations = bounded(
      animation.iterations,
      1,
      10_000,
      "animation.iterations",
      animation.importKey
    );
    if (!Number.isSafeInteger(order) || !Number.isSafeInteger(iterations)) {
      fail(
        "ANIMATION_NUMBER_INVALID",
        "animation order and iterations must be integers",
        animation.importKey
      );
    }
    animations[id] = {
      id,
      scene_id: sceneId,
      ...(targetNodeId ? { target_node_id: targetNodeId } : {}),
      phase: animation.phase,
      trigger: animation.trigger,
      depends_on: dependencyIds,
      order,
      delay_seconds: bounded(
        animation.delaySeconds,
        0,
        86_400,
        "animation.delaySeconds",
        animation.importKey
      ),
      duration_seconds: bounded(
        animation.durationSeconds,
        0,
        86_400,
        "animation.durationSeconds",
        animation.importKey
      ),
      easing: animation.easing,
      fill: animation.fill,
      iterations,
      tracks: animation.tracks.map((track) => ({
        property: track.property,
        from: finite(track.from, "animation.track.from", animation.importKey),
        to: finite(track.to, "animation.track.to", animation.importKey),
      })),
      media_action: animation.mediaAction,
      media_value: finite(
        animation.mediaValue,
        "animation.mediaValue",
        animation.importKey
      ),
      ...(animation.cueId ? { cue_id: animation.cueId } : {}),
    };
    completed += 1;
    options.onProgress?.({ completed, total: totalWork });
  }

  const draftDocument: grida.program.document.Document = {
    scenes_ref: scenesRef,
    entry_scene_id: scenesRef[0],
    nodes,
    links,
    images: {},
    bitmaps: {},
    properties: {},
    external_assets: externalAssets,
    animations,
    minimum_reader_version: grida.program.document.SCHEMA_VERSION,
  };
  const animationIssues = validateAnimationRepository(draftDocument);
  if (animationIssues.length > 0) {
    const issue = animationIssues[0]!;
    fail(
      issue.code,
      issue.message,
      Object.entries(sourceMap.animations).find(
        ([, nativeAnimationId]) => nativeAnimationId === issue.clipId
      )?.[0]
    );
  }
  // FlatBuffers stores several graphics scalars as f32 and fills in explicit
  // codec defaults. Make the production codec's reopened form canonical so
  // the archive and JSON snapshot can never disagree about those values.
  const document = compilerIO.decode(
    compilerIO.encode(draftDocument, grida.program.document.SCHEMA_VERSION)
  );
  const semanticHash = await sha256(stableStringify(document));
  const archive = compilerIO.pack(
    document,
    grida.program.document.SCHEMA_VERSION
  );
  const reopened = compilerIO.unpack(archive);
  const decoded = compilerIO.decode(reopened.document);
  const decodedHash = await sha256(stableStringify(decoded));
  if (decodedHash !== semanticHash)
    fail(
      "CODEC_ROUNDTRIP_MISMATCH",
      "compiled document changed after production codec round-trip"
    );
  const archiveHash = await sha256(archive);
  const snapshotJson = compilerIO.snapshot(
    document,
    grida.program.document.SCHEMA_VERSION
  );
  return {
    document,
    archive,
    snapshotJson,
    sourceMap,
    diagnostics: [...(dto.diagnostics ?? [])],
    semanticHash,
    archiveHash,
    schemaVersion: grida.program.document.SCHEMA_VERSION,
    minimumReaderVersion: grida.program.document.SCHEMA_VERSION,
    compilerVersion: NATIVE_COMPILER_VERSION,
    contractHash: NATIVE_COMPILER_CONTRACT_HASH,
  };
}
