import init, { createCanvas } from "@grida/canvas-wasm";
import { io } from "@grida/io";

export const LIVE_SCENE_RUNTIME_VERSION = "1.4.0";
export const LIVE_SCENE_RUNTIME_CONTRACT =
  "live-scene-runtime-v1|archive-grid|scene-identity|document-font-introspection|shared-font-fallback|selected-scene-atomic-patch|engine-owned-text-layout|persistent-surface|shared-raster-thumbnails|document-driven-video|dom-gated-animation";

type UnknownRecord = Record<string, unknown>;

export interface LiveSceneNode extends UnknownRecord {
  id: string;
  type: string;
}

export interface LiveSceneSnapshot {
  version: string;
  document: {
    nodes: Record<string, LiveSceneNode>;
    links: Record<string, string[]>;
    scenes_ref: string[];
    animations?: Record<string, UnknownRecord>;
  } & UnknownRecord;
}

export interface LiveSceneArchive {
  document: Uint8Array;
  images: Record<string, Uint8Array>;
}

export interface LiveSceneSurface {
  loadSceneGrida(bytes: Uint8Array): void;
  switchScene(sceneId: string): void;
  loadedSceneIds(): string[];
  drainMissingImages(): string[];
  resolveImage(resourceId: string, bytes: Uint8Array): void;
  listMissingFonts(): Array<{ family: string }>;
  addFont(family: string, bytes: Uint8Array): void;
  setFallbackFonts(families: string[]): void;
  replaceNode(bytes: Uint8Array): boolean;
  getNodeAbsoluteBoundingBox(
    target: string
  ): { x: number; y: number; width: number; height: number } | null;
  setMainCameraTransform(
    transform: [[number, number, number], [number, number, number]]
  ): void;
  runtime_renderer_set_isolation_stage_preset?(preset: number): void;
  resize(width: number, height: number): void;
  redraw(): void;
  dispose(): void;
}

export interface LiveSceneCapabilities {
  eligible: boolean;
  reason: "eligible" | "invalid-document" | "missing-scene" | "animation";
  hasInSceneVideo: boolean;
  hasAnimation: boolean;
  nodeCount: number;
}

export interface LiveScenePatch {
  text?: Readonly<Record<string, string>>;
  visibility?: Readonly<Record<string, boolean>>;
}

export interface LiveSceneDiagnostics {
  archiveLoads: number;
  patchesApplied: number;
  patchFailures: number;
  firstFrameMs: number;
  unresolvedImages: string[];
  unresolvedFonts: string[];
}

export class LiveSceneRuntimeError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LiveSceneRuntimeError";
    this.code = code;
  }
}

export interface CreateLiveSceneRuntimeOptions {
  canvas: HTMLCanvasElement;
  archive: Uint8Array | LiveSceneArchive;
  snapshot: unknown;
  sceneId: string;
  expectedSchemaVersion: string;
  locateFile?: (path: string, version: string) => string;
  dpr?: number;
  createSurface?: () => Promise<LiveSceneSurface>;
  encodeNode?: (node: LiveSceneNode) => Uint8Array;
  resolveImage?: (resourceId: string) => Promise<Uint8Array | null>;
  resolveFont?: (
    family: string
  ) => Promise<Uint8Array | readonly Uint8Array[] | null>;
  fallbackFonts?: readonly string[];
  afterPaint?: () => Promise<void>;
}

export interface LiveSceneRasterSurface {
  loadSceneGrida(bytes: Uint8Array): void;
  switchScene(sceneId: string): void;
  loadedSceneIds(): string[];
  addImageWithId(bytes: Uint8Array, resourceId: string): unknown;
  addFont(family: string, bytes: Uint8Array): void;
  setFallbackFonts(families: string[]): void;
  exportNodeAs(
    nodeId: string,
    options: {
      format: "PNG";
      constraints: { type: "scale-to-fit-width"; value: number };
    }
  ): { data: Uint8Array };
  dispose(): void;
}

export interface CreateLiveSceneThumbnailRendererOptions {
  locateFile?: (path: string, version: string) => string;
  createSurface?: () => Promise<LiveSceneRasterSurface>;
}

export interface RenderLiveSceneThumbnailOptions {
  archive: Uint8Array | LiveSceneArchive;
  snapshot: unknown;
  sceneId: string;
  expectedSchemaVersion: string;
  width: number;
  fallbackFonts?: readonly string[];
  resolveImage?: (resourceId: string) => Promise<Uint8Array | null>;
  resolveFont?: (
    family: string
  ) => Promise<Uint8Array | readonly Uint8Array[] | null>;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSnapshot(
  value: unknown,
  expectedSchemaVersion: string
): LiveSceneSnapshot {
  if (
    !isRecord(value) ||
    value.version !== expectedSchemaVersion ||
    !isRecord(value.document)
  ) {
    throw new LiveSceneRuntimeError(
      "invalid-snapshot",
      "The live scene snapshot does not match the pinned schema."
    );
  }
  const document = value.document;
  if (
    !isRecord(document.nodes) ||
    !isRecord(document.links) ||
    !Array.isArray(document.scenes_ref)
  ) {
    throw new LiveSceneRuntimeError(
      "invalid-snapshot",
      "The live scene snapshot is structurally invalid."
    );
  }
  const nodes: Record<string, LiveSceneNode> = {};
  for (const [id, raw] of Object.entries(document.nodes)) {
    if (!isRecord(raw) || raw.id !== id || typeof raw.type !== "string") {
      throw new LiveSceneRuntimeError(
        "invalid-snapshot",
        `The live scene node ${id} is invalid.`
      );
    }
    nodes[id] = raw as LiveSceneNode;
  }
  const links: Record<string, string[]> = {};
  for (const [parent, raw] of Object.entries(document.links)) {
    if (
      !nodes[parent] ||
      !Array.isArray(raw) ||
      !raw.every((id) => typeof id === "string" && Boolean(nodes[id]))
    ) {
      throw new LiveSceneRuntimeError(
        "invalid-snapshot",
        `The live scene links for ${parent} are invalid.`
      );
    }
    links[parent] = [...raw] as string[];
  }
  const scenes = document.scenes_ref;
  if (
    scenes.length === 0 ||
    !scenes.every((id) => typeof id === "string" && nodes[id]?.type === "scene")
  ) {
    throw new LiveSceneRuntimeError(
      "invalid-snapshot",
      "The live scene snapshot contains invalid scene identities."
    );
  }
  return {
    version: expectedSchemaVersion,
    document: {
      ...document,
      nodes,
      links,
      scenes_ref: [...scenes] as string[],
      animations: isRecord(document.animations)
        ? (document.animations as Record<string, UnknownRecord>)
        : {},
    },
  };
}

function descendants(
  snapshot: LiveSceneSnapshot,
  sceneId: string
): Set<string> {
  const seen = new Set<string>();
  const pending = [sceneId];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (const child of snapshot.document.links[id] ?? []) pending.push(child);
  }
  return seen;
}

function addFontFamily(out: Set<string>, value: unknown): void {
  if (typeof value !== "string") return;
  const family = value.trim();
  if (family && !family.startsWith("var(")) out.add(family);
}

/** Font families authored into one canonical scene. This is the authority for
 * hydration; renderer-reported misses are only an additional diagnostic seam
 * because an embedded fallback can otherwise hide an unavailable family. */
export function collectLiveSceneFontFamilies(
  value: unknown,
  sceneId: string
): string[] {
  if (!isRecord(value) || !isRecord(value.document)) return [];
  const document = value.document;
  if (!isRecord(document.nodes) || !isRecord(document.links)) return [];
  const snapshot = value as unknown as LiveSceneSnapshot;
  if (!isRecord(document.nodes[sceneId])) return [];
  const families = new Set<string>();
  for (const id of descendants(snapshot, sceneId)) {
    const node = document.nodes[id];
    if (!isRecord(node)) continue;
    addFontFamily(families, node.font_family);
    if (isRecord(node.default_style)) {
      addFontFamily(families, node.default_style.font_family);
    }
    if (Array.isArray(node.styled_runs)) {
      for (const run of node.styled_runs) {
        if (isRecord(run) && isRecord(run.style)) {
          addFontFamily(families, run.style.font_family);
        }
      }
    }
  }
  return [...families].sort((a, b) => a.localeCompare(b));
}

function resolvedFontFaces(
  resolved: Uint8Array | readonly Uint8Array[] | null
): Uint8Array[] {
  return resolved instanceof Uint8Array
    ? resolved.byteLength > 0
      ? [resolved]
      : []
    : Array.isArray(resolved)
      ? resolved.filter(
          (bytes): bytes is Uint8Array =>
            bytes instanceof Uint8Array && bytes.byteLength > 0
        )
      : [];
}

interface FontHydrationSurface {
  addFont(family: string, bytes: Uint8Array): void;
  setFallbackFonts(families: string[]): void;
}

async function hydrateSceneFonts(options: {
  surface: FontHydrationSurface;
  requestedFonts: Iterable<string>;
  fallbackFonts?: readonly string[];
  resolveFont?: (
    family: string
  ) => Promise<Uint8Array | readonly Uint8Array[] | null>;
}): Promise<string[]> {
  const requestedFonts = new Set(
    [...options.requestedFonts].map((family) => family.trim()).filter(Boolean)
  );
  const unresolved: string[] = [];
  for (const family of requestedFonts) {
    const faces = resolvedFontFaces(
      options.resolveFont ? await options.resolveFont(family) : null
    );
    if (faces.length === 0) unresolved.push(family);
    else for (const bytes of faces) options.surface.addFont(family, bytes);
  }
  const fallbackFonts = [
    ...new Set(
      (options.fallbackFonts ?? [])
        .map((family) => family.trim())
        .filter(Boolean)
    ),
  ];
  for (const family of fallbackFonts) {
    if (requestedFonts.has(family)) continue;
    const faces = resolvedFontFaces(
      options.resolveFont ? await options.resolveFont(family) : null
    );
    for (const bytes of faces) options.surface.addFont(family, bytes);
  }
  if (fallbackFonts.length > 0) options.surface.setFallbackFonts(fallbackFonts);
  return [...new Set(unresolved)].sort();
}

function collectLiveSceneImageResources(
  snapshot: LiveSceneSnapshot,
  sceneId: string
): string[] {
  const resources = new Set<string>();
  const inspect = (value: unknown): void => {
    if (typeof value === "string") {
      if (/^res:\/\/images\/[a-zA-Z0-9._-]+$/.test(value)) resources.add(value);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) inspect(item);
      return;
    }
    for (const item of Object.values(value as UnknownRecord)) inspect(item);
  };
  for (const id of descendants(snapshot, sceneId))
    inspect(snapshot.document.nodes[id]);
  return [...resources].sort();
}

function sceneExportNodeId(
  snapshot: LiveSceneSnapshot,
  sceneId: string
): string {
  const children = snapshot.document.links[sceneId] ?? [];
  return (
    children.find((id) => snapshot.document.nodes[id]?.type === "container") ??
    sceneId
  );
}

/** Persistent single-surface raster renderer for tile workers. It consumes the
 * same archive, scene identity, font hydration, and Grida engine as live output
 * without allocating one WebGL context per tile. */
export class LiveSceneThumbnailRenderer {
  private readonly surface: LiveSceneRasterSurface;
  private readonly registeredImages = new Set<string>();
  private readonly registeredFonts = new Set<string>();

  constructor(surface: LiveSceneRasterSurface) {
    this.surface = surface;
  }

  async render(options: RenderLiveSceneThumbnailOptions): Promise<Uint8Array> {
    const snapshot = normalizeSnapshot(
      options.snapshot,
      options.expectedSchemaVersion
    );
    if (snapshot.document.nodes[options.sceneId]?.type !== "scene") {
      throw new LiveSceneRuntimeError(
        "missing-scene",
        `The target scene ${options.sceneId} is not in the canonical document.`
      );
    }
    const archive =
      options.archive instanceof Uint8Array
        ? unpackLiveSceneArchive(options.archive)
        : options.archive;
    for (const [filename, bytes] of Object.entries(archive.images)) {
      const resourceId = resourceIdForArchiveImage(filename);
      if (this.registeredImages.has(resourceId)) continue;
      this.surface.addImageWithId(bytes, resourceId);
      this.registeredImages.add(resourceId);
    }
    for (const resourceId of collectLiveSceneImageResources(
      snapshot,
      options.sceneId
    )) {
      if (this.registeredImages.has(resourceId)) continue;
      const bytes = options.resolveImage
        ? await options.resolveImage(resourceId)
        : null;
      if (!bytes) continue;
      this.surface.addImageWithId(bytes, resourceId);
      this.registeredImages.add(resourceId);
    }
    await hydrateSceneFonts({
      surface: this.surface,
      requestedFonts: collectLiveSceneFontFamilies(snapshot, options.sceneId),
      fallbackFonts: options.fallbackFonts,
      resolveFont: async (family) => {
        if (this.registeredFonts.has(family)) return null;
        const resolved = options.resolveFont
          ? await options.resolveFont(family)
          : null;
        if (resolvedFontFaces(resolved).length > 0)
          this.registeredFonts.add(family);
        return resolved;
      },
    });
    this.surface.loadSceneGrida(archive.document);
    if (!this.surface.loadedSceneIds().includes(options.sceneId)) {
      throw new LiveSceneRuntimeError(
        "missing-scene",
        `The engine did not decode target scene ${options.sceneId}.`
      );
    }
    this.surface.switchScene(options.sceneId);
    const result = this.surface.exportNodeAs(
      sceneExportNodeId(snapshot, options.sceneId),
      {
        format: "PNG",
        constraints: {
          type: "scale-to-fit-width",
          value: Math.max(1, Math.round(options.width)),
        },
      }
    );
    return new Uint8Array(result.data);
  }

  dispose(): void {
    this.surface.dispose();
  }
}

export async function createLiveSceneThumbnailRenderer(
  options: CreateLiveSceneThumbnailRendererOptions = {}
): Promise<LiveSceneThumbnailRenderer> {
  const surface = options.createSurface
    ? await options.createSurface()
    : await createCanvas({
        backend: "raster",
        width: 16,
        height: 16,
        locateFile: options.locateFile,
        useEmbeddedFonts: true,
        config: { skip_layout: false },
      });
  return new LiveSceneThumbnailRenderer(surface);
}

export function scanLiveSceneCapabilities(
  value: unknown,
  sceneId: string
): LiveSceneCapabilities {
  if (!isRecord(value) || !isRecord(value.document)) {
    return {
      eligible: false,
      reason: "invalid-document",
      hasInSceneVideo: false,
      hasAnimation: false,
      nodeCount: 0,
    };
  }
  const document = value.document;
  if (!isRecord(document.nodes) || !isRecord(document.links)) {
    return {
      eligible: false,
      reason: "invalid-document",
      hasInSceneVideo: false,
      hasAnimation: false,
      nodeCount: 0,
    };
  }
  const snapshot = value as unknown as LiveSceneSnapshot;
  if (
    !isRecord(document.nodes[sceneId]) ||
    document.nodes[sceneId]?.type !== "scene"
  ) {
    return {
      eligible: false,
      reason: "missing-scene",
      hasInSceneVideo: false,
      hasAnimation: false,
      nodeCount: 0,
    };
  }
  const ids = descendants(snapshot, sceneId);
  const hasInSceneVideo = [...ids].some(
    (id) =>
      (document.nodes as Record<string, UnknownRecord>)[id]?.type === "video"
  );
  const animations = isRecord(document.animations) ? document.animations : {};
  const hasAnimation = Object.values(animations).some(
    (animation) => isRecord(animation) && animation.scene_id === sceneId
  );
  return {
    eligible: !hasAnimation,
    reason: hasAnimation ? "animation" : "eligible",
    hasInSceneVideo,
    hasAnimation,
    nodeCount: ids.size,
  };
}

export function unpackLiveSceneArchive(bytes: Uint8Array): LiveSceneArchive {
  try {
    const unpacked = io.archive.unpack(bytes);
    return { document: unpacked.document, images: unpacked.images };
  } catch (cause) {
    throw new LiveSceneRuntimeError(
      "invalid-archive",
      "The Grida live scene archive could not be opened.",
      { cause }
    );
  }
}

function defaultAfterPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function resourceIdForArchiveImage(filename: string): string {
  const basename = filename.split("/").pop() ?? filename;
  const dot = basename.lastIndexOf(".");
  const identity = dot > 0 ? basename.slice(0, dot) : basename;
  return `res://images/${identity}`;
}

function fitCamera(
  surface: LiveSceneSurface,
  canvas: HTMLCanvasElement,
  dpr: number
): void {
  const bounds = surface.getNodeAbsoluteBoundingBox("<scene>");
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    throw new LiveSceneRuntimeError(
      "invalid-scene-bounds",
      "The target scene has no finite render bounds."
    );
  }
  const viewportWidth = canvas.width / dpr;
  const viewportHeight = canvas.height / dpr;
  const scale = Math.min(
    viewportWidth / bounds.width,
    viewportHeight / bounds.height
  );
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new LiveSceneRuntimeError(
      "invalid-scene-bounds",
      "The target scene cannot be fitted to the output surface."
    );
  }
  const translateX =
    (viewportWidth - bounds.width * scale) / 2 - bounds.x * scale;
  const translateY =
    (viewportHeight - bounds.height * scale) / 2 - bounds.y * scale;
  const physicalScale = dpr * scale;
  const centeredX = dpr * translateX - canvas.width / 2;
  const centeredY = dpr * translateY - canvas.height / 2;
  surface.setMainCameraTransform([
    [1 / physicalScale, 0, -centeredX / physicalScale],
    [0, 1 / physicalScale, -centeredY / physicalScale],
  ]);
}

class LiveSceneRuntime {
  private readonly surface: LiveSceneSurface;
  private readonly canvas: HTMLCanvasElement;
  private readonly dpr: number;
  private readonly encodeNode: (node: LiveSceneNode) => Uint8Array;
  private readonly afterPaint: () => Promise<void>;
  private readonly nodes: Record<string, LiveSceneNode>;
  private readonly activeNodeIds: ReadonlySet<string>;
  private disposed = false;
  private patchQueue: Promise<void> = Promise.resolve();
  private readonly stats: LiveSceneDiagnostics;

  constructor(
    surface: LiveSceneSurface,
    canvas: HTMLCanvasElement,
    dpr: number,
    snapshot: LiveSceneSnapshot,
    sceneId: string,
    encodeNode: (node: LiveSceneNode) => Uint8Array,
    afterPaint: () => Promise<void>,
    stats: LiveSceneDiagnostics
  ) {
    this.surface = surface;
    this.canvas = canvas;
    this.dpr = dpr;
    this.encodeNode = encodeNode;
    this.afterPaint = afterPaint;
    this.nodes = Object.fromEntries(
      Object.entries(snapshot.document.nodes).map(([id, node]) => [
        id,
        { ...node },
      ])
    );
    this.activeNodeIds = descendants(snapshot, sceneId);
    this.stats = stats;
  }

  diagnostics(): LiveSceneDiagnostics {
    return {
      ...this.stats,
      unresolvedImages: [...this.stats.unresolvedImages],
      unresolvedFonts: [...this.stats.unresolvedFonts],
    };
  }

  resize(width: number, height: number, dpr = this.dpr): void {
    if (this.disposed) return;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.surface.resize(this.canvas.width, this.canvas.height);
    fitCamera(this.surface, this.canvas, dpr);
    this.surface.redraw();
  }

  applyPatch(patch: LiveScenePatch): Promise<void> {
    const apply = async () => {
      if (this.disposed) {
        throw new LiveSceneRuntimeError(
          "runtime-disposed",
          "The live scene runtime has been disposed."
        );
      }
      const ids = new Set([
        ...Object.keys(patch.text ?? {}),
        ...Object.keys(patch.visibility ?? {}),
      ]);
      const changes: Array<{
        id: string;
        previous: LiveSceneNode;
        next: LiveSceneNode;
        previousBytes: Uint8Array;
        nextBytes: Uint8Array;
      }> = [];
      for (const id of [...ids].sort()) {
        const current = this.nodes[id];
        if (!current) {
          this.stats.patchFailures += 1;
          throw new LiveSceneRuntimeError(
            "patch-node-missing",
            `The live patch target ${id} is not in the active document.`
          );
        }
        if (!this.activeNodeIds.has(id)) {
          this.stats.patchFailures += 1;
          throw new LiveSceneRuntimeError(
            "patch-node-outside-scene",
            `The live patch target ${id} is outside the active scene.`
          );
        }
        const next: LiveSceneNode = { ...current };
        if (
          patch.text &&
          Object.prototype.hasOwnProperty.call(patch.text, id)
        ) {
          if (current.type !== "text" && current.type !== "tspan") {
            this.stats.patchFailures += 1;
            throw new LiveSceneRuntimeError(
              "patch-node-type",
              `The live text patch target ${id} is not a text node.`
            );
          }
          next.text = patch.text[id] ?? "";
          if (Array.isArray(next.styled_runs)) next.styled_runs = [];
        }
        if (
          patch.visibility &&
          Object.prototype.hasOwnProperty.call(patch.visibility, id)
        ) {
          next.active = patch.visibility[id] === true;
        }
        changes.push({
          id,
          previous: current,
          next,
          previousBytes: this.encodeNode(current),
          nextBytes: this.encodeNode(next),
        });
      }
      if (changes.length === 0) return;
      const committed: typeof changes = [];
      for (const change of changes) {
        if (!this.surface.replaceNode(change.nextBytes)) {
          for (const prior of committed.reverse()) {
            this.surface.replaceNode(prior.previousBytes);
          }
          this.stats.patchFailures += 1;
          throw new LiveSceneRuntimeError(
            "patch-rejected",
            `The engine rejected the atomic live patch at ${change.id}.`
          );
        }
        committed.push(change);
      }
      for (const change of changes) this.nodes[change.id] = change.next;
      this.surface.redraw();
      await this.afterPaint();
      this.stats.patchesApplied += 1;
    };
    const pending = this.patchQueue.then(apply, apply);
    this.patchQueue = pending.catch(() => {});
    return pending;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.surface.dispose();
  }
}

export async function createLiveSceneRuntime(
  options: CreateLiveSceneRuntimeOptions
): Promise<LiveSceneRuntime> {
  const startedAt = performance.now();
  const snapshot = normalizeSnapshot(
    options.snapshot,
    options.expectedSchemaVersion
  );
  const capabilities = scanLiveSceneCapabilities(snapshot, options.sceneId);
  if (capabilities.reason === "missing-scene") {
    throw new LiveSceneRuntimeError(
      "missing-scene",
      `The target scene ${options.sceneId} is not in the canonical document.`
    );
  }
  const archive =
    options.archive instanceof Uint8Array
      ? unpackLiveSceneArchive(options.archive)
      : options.archive;
  if (
    !(archive.document instanceof Uint8Array) ||
    archive.document.byteLength === 0
  ) {
    throw new LiveSceneRuntimeError(
      "invalid-archive",
      "The Grida archive has no document bytes."
    );
  }
  const dpr = Math.max(0.25, Math.min(8, options.dpr ?? 1));
  const surface = options.createSurface
    ? await options.createSurface()
    : await (async () => {
        const factory = await init(
          options.locateFile ? { locateFile: options.locateFile } : undefined
        );
        return factory.createWebGLCanvasSurface(options.canvas, {
          use_embedded_fonts: true,
          config: { skip_layout: false },
        }) as LiveSceneSurface;
      })();
  const stats: LiveSceneDiagnostics = {
    archiveLoads: 0,
    patchesApplied: 0,
    patchFailures: 0,
    firstFrameMs: 0,
    unresolvedImages: [],
    unresolvedFonts: [],
  };
  try {
    surface.loadSceneGrida(archive.document);
    stats.archiveLoads = 1;
    if (!surface.loadedSceneIds().includes(options.sceneId)) {
      throw new LiveSceneRuntimeError(
        "missing-scene",
        `The engine did not decode target scene ${options.sceneId}.`
      );
    }
    surface.switchScene(options.sceneId);
    surface.runtime_renderer_set_isolation_stage_preset?.(0);
    surface.resize(options.canvas.width, options.canvas.height);
    fitCamera(surface, options.canvas, dpr);

    for (const [filename, bytes] of Object.entries(archive.images)) {
      surface.resolveImage(resourceIdForArchiveImage(filename), bytes);
    }
    surface.redraw();
    const afterPaint = options.afterPaint ?? defaultAfterPaint;
    await afterPaint();

    const unresolvedImages: string[] = [];
    for (const resourceId of surface.drainMissingImages()) {
      const bytes = options.resolveImage
        ? await options.resolveImage(resourceId)
        : null;
      if (bytes) surface.resolveImage(resourceId, bytes);
      else unresolvedImages.push(resourceId);
    }
    if (unresolvedImages.length > 0) {
      stats.unresolvedImages = [...new Set(unresolvedImages)].sort();
      throw new LiveSceneRuntimeError(
        "missing-image",
        `The live scene is missing ${stats.unresolvedImages.length} image resource(s).`
      );
    }

    const declaredFonts = collectLiveSceneFontFamilies(
      snapshot,
      options.sceneId
    );
    const requestedFonts = new Set(declaredFonts);
    for (const { family } of surface.listMissingFonts()) {
      if (family.trim()) requestedFonts.add(family.trim());
    }
    stats.unresolvedFonts = await hydrateSceneFonts({
      surface,
      requestedFonts,
      fallbackFonts: options.fallbackFonts,
      resolveFont: options.resolveFont,
    });
    if (stats.unresolvedFonts.length > 0 && !options.fallbackFonts?.length) {
      throw new LiveSceneRuntimeError(
        "missing-font",
        `The live scene is missing ${stats.unresolvedFonts.length} font family or families.`
      );
    }

    surface.redraw();
    await afterPaint();
    stats.firstFrameMs = Math.max(0, performance.now() - startedAt);
    return new LiveSceneRuntime(
      surface,
      options.canvas,
      dpr,
      snapshot,
      options.sceneId,
      options.encodeNode ?? ((node) => io.GRID.encodeNode(node as never)),
      afterPaint,
      stats
    );
  } catch (error) {
    surface.dispose();
    throw error;
  }
}

export type LiveSceneRuntimeInstance = Awaited<
  ReturnType<typeof createLiveSceneRuntime>
>;
