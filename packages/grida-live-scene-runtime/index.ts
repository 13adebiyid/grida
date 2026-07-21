import init, { createCanvas } from "@grida/canvas-wasm";
import { io } from "@grida/io";

export const LIVE_SCENE_RUNTIME_VERSION = "1.5.6";
export const LIVE_SCENE_RUNTIME_CONTRACT =
  "live-scene-runtime-v1|archive-grid|scene-identity|document-image-introspection|document-font-introspection|shared-font-fallback|attributed-text-style-rebase|fitted-text-style-patch|selected-scene-atomic-patch|atomic-scene-activation|verified-patch-rollback|engine-owned-text-layout|persistent-surface|cancellable-boot|deferred-webgl-context-release|shared-raster-thumbnails|projected-raster-thumbnails|document-driven-video|dom-gated-animation|same-scene-canonical-reprojection|presentation-archive-background-projection";

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

interface OwnedLiveSceneSurface {
  surface: LiveSceneSurface;
  dispose(): void;
}

interface EmscriptenGLContextRegistry {
  currentContext?: { handle: number } | null;
  makeContextCurrent(handle: number): void;
  deleteContext(handle: number): void;
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
  textStyles?: Readonly<Record<string, { fontSize?: number }>>;
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
  /** Projects only the selected scene root to transparent in the archive
   * loaded by this presentation runtime. The caller retains the authored
   * archive and creates a distinct runtime generation when ownership changes. */
  transparentSceneBackground?: boolean;
  locateFile?: (path: string, version: string) => string;
  dpr?: number;
  /** Cancels runtime creation only. A successfully returned runtime owns its
   * surface until dispose() is called, independently of this signal. */
  signal?: AbortSignal;
  createSurface?: (signal?: AbortSignal) => Promise<LiveSceneSurface>;
  encodeNode?: (node: LiveSceneNode) => Uint8Array;
  resolveImage?: (
    resourceId: string,
    signal?: AbortSignal
  ) => Promise<Uint8Array | null>;
  resolveFont?: (
    family: string,
    signal?: AbortSignal
  ) => Promise<Uint8Array | readonly Uint8Array[] | null>;
  fallbackFonts?: readonly string[];
  afterPaint?: (signal?: AbortSignal) => Promise<void>;
}

export interface LiveSceneRasterSurface {
  loadSceneGrida(bytes: Uint8Array): void;
  switchScene(sceneId: string): void;
  loadedSceneIds(): string[];
  addImageWithId(bytes: Uint8Array, resourceId: string): unknown;
  addFont(family: string, bytes: Uint8Array): void;
  setFallbackFonts(families: string[]): void;
  replaceNode(bytes: Uint8Array): boolean;
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
  encodeNode?: (node: LiveSceneNode) => Uint8Array;
}

export interface RenderLiveSceneThumbnailOptions {
  archive: Uint8Array | LiveSceneArchive;
  snapshot: unknown;
  sceneId: string;
  expectedSchemaVersion: string;
  width: number;
  fallbackFonts?: readonly string[];
  patch?: LiveScenePatch;
  resolveImage?: (resourceId: string) => Promise<Uint8Array | null>;
  resolveFont?: (
    family: string
  ) => Promise<Uint8Array | readonly Uint8Array[] | null>;
}

function abortError(): DOMException {
  return new DOMException(
    "Live scene runtime creation was aborted.",
    "AbortError"
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** Races one external creation boundary against cancellation. The operation is
 * invoked only while the signal is live, late rejections are consumed, and an
 * optional late value adopter can release resources created after cancellation. */
function awaitAbortable<T>(
  operation: () => PromiseLike<T>,
  signal?: AbortSignal,
  onLateResolve?: (value: T) => void
): Promise<T> {
  throwIfAborted(signal);
  let pending: PromiseLike<T>;
  try {
    pending = operation();
  } catch (error) {
    return Promise.reject(error);
  }
  if (!signal) return Promise.resolve(pending);
  if (signal.aborted) {
    void Promise.resolve(pending)
      .then((value) => onLateResolve?.(value))
      .catch(() => {});
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void Promise.resolve(pending)
      .then(
        (value) => {
          if (settled) {
            onLateResolve?.(value);
            return;
          }
          settled = true;
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          reject(error);
        }
      )
      .catch(() => {});
  });
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
    family: string,
    signal?: AbortSignal
  ) => Promise<Uint8Array | readonly Uint8Array[] | null>;
  signal?: AbortSignal;
}): Promise<string[]> {
  const requestedFonts = new Set(
    [...options.requestedFonts].map((family) => family.trim()).filter(Boolean)
  );
  const unresolved: string[] = [];
  for (const family of requestedFonts) {
    const faces = resolvedFontFaces(
      options.resolveFont
        ? await awaitAbortable(
            () => options.resolveFont!(family, options.signal),
            options.signal
          )
        : null
    );
    throwIfAborted(options.signal);
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
      options.resolveFont
        ? await awaitAbortable(
            () => options.resolveFont!(family, options.signal),
            options.signal
          )
        : null
    );
    throwIfAborted(options.signal);
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

function projectLiveSceneNode(
  node: LiveSceneNode,
  id: string,
  patch: LiveScenePatch
): LiveSceneNode {
  const next: LiveSceneNode = { ...node };
  const hasTextPatch = Boolean(
    patch.text && Object.prototype.hasOwnProperty.call(patch.text, id)
  );
  const textStylePatch = patch.textStyles?.[id];
  if (
    (hasTextPatch || textStylePatch) &&
    node.type !== "text" &&
    node.type !== "tspan"
  ) {
    throw new LiveSceneRuntimeError(
      "patch-node-type",
      `The live text patch target ${id} is not a text node.`
    );
  }
  if (textStylePatch?.fontSize !== undefined) {
    const fontSize = textStylePatch.fontSize;
    if (!Number.isFinite(fontSize) || fontSize <= 0 || fontSize > 4096) {
      throw new LiveSceneRuntimeError(
        "patch-text-style",
        `The live text style patch at ${id} has an invalid font size.`
      );
    }
    if (node.type === "tspan") {
      next.font_size = fontSize;
    } else {
      if (!isRecord(next.default_style)) {
        throw new LiveSceneRuntimeError(
          "patch-node-style",
          `The attributed text patch target ${id} has no default style.`
        );
      }
      next.default_style = { ...next.default_style, font_size: fontSize };
      if (Array.isArray(next.styled_runs)) {
        next.styled_runs = next.styled_runs.map((run) =>
          isRecord(run) && isRecord(run.style)
            ? { ...run, style: { ...run.style, font_size: fontSize } }
            : run
        );
      }
    }
  }
  if (hasTextPatch) {
    const nextText = patch.text?.[id] ?? "";
    next.text = nextText;
    const previousText = typeof node.text === "string" ? node.text : "";
    if (Array.isArray(next.styled_runs) && nextText !== previousText) {
      if (!isRecord(next.default_style)) {
        throw new LiveSceneRuntimeError(
          "patch-node-style",
          `The attributed text patch target ${id} has no default style.`
        );
      }
      next.styled_runs = [
        {
          start: 0,
          end: nextText.length,
          style: { ...next.default_style },
        },
      ];
    }
  }
  if (
    patch.visibility &&
    Object.prototype.hasOwnProperty.call(patch.visibility, id)
  ) {
    next.active = patch.visibility[id] === true;
  }
  return next;
}

/** Persistent single-surface raster renderer for tile workers. It consumes the
 * same archive, scene identity, font hydration, and Grida engine as live output
 * without allocating one WebGL context per tile. */
export class LiveSceneThumbnailRenderer {
  private readonly surface: LiveSceneRasterSurface;
  private readonly encodeNode: (node: LiveSceneNode) => Uint8Array;
  private readonly registeredImages = new Set<string>();
  private readonly registeredFonts = new Set<string>();

  constructor(
    surface: LiveSceneRasterSurface,
    encodeNode: (node: LiveSceneNode) => Uint8Array
  ) {
    this.surface = surface;
    this.encodeNode = encodeNode;
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
    const patch = options.patch ?? {};
    const patchIds = [
      ...new Set([
        ...Object.keys(patch.text ?? {}),
        ...Object.keys(patch.textStyles ?? {}),
        ...Object.keys(patch.visibility ?? {}),
      ]),
    ].sort();
    const activeNodeIds = descendants(snapshot, options.sceneId);
    for (const id of patchIds) {
      const node = snapshot.document.nodes[id];
      if (!node) {
        throw new LiveSceneRuntimeError(
          "patch-node-missing",
          `The live patch target ${id} is not in the canonical document.`
        );
      }
      if (!activeNodeIds.has(id)) {
        throw new LiveSceneRuntimeError(
          "patch-node-outside-scene",
          `The live patch target ${id} is outside the selected thumbnail scene.`
        );
      }
      const projected = projectLiveSceneNode(node, id, patch);
      if (!this.surface.replaceNode(this.encodeNode(projected))) {
        throw new LiveSceneRuntimeError(
          "patch-rejected",
          `The engine rejected the thumbnail patch at ${id}.`
        );
      }
    }
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
  return new LiveSceneThumbnailRenderer(
    surface,
    options.encodeNode ?? ((node) => io.GRID.encodeNode(node as never))
  );
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

/** Creates a presentation-only archive projection before the engine owns any
 * pixels. Scene nodes cannot be changed through the per-node WASM API, so the
 * root fill and its direct stage-container fill must be projected in the
 * authoritative GRID document rather than patched after authored pixels have
 * already painted. Deliberate foreground children of the stage are retained. */
export function projectLiveSceneArchiveBackground(
  documentBytes: Uint8Array,
  sceneId: string,
  transparent: boolean,
  schemaVersion?: string
): Uint8Array {
  if (!transparent) return documentBytes;
  try {
    const document = io.GRID.decode(documentBytes) as unknown as UnknownRecord;
    if (!isRecord(document.nodes)) {
      throw new Error("The GRID document has no node map.");
    }
    const scene = document.nodes[sceneId];
    if (!isRecord(scene) || scene.type !== "scene") {
      throw new Error(`The GRID document has no scene ${sceneId}.`);
    }
    const projectedScene = { ...scene };
    delete projectedScene.background_color;
    const projectedNodes = { ...document.nodes, [sceneId]: projectedScene };
    const links = isRecord(document.links) ? document.links : {};
    const stageIds = Array.isArray(links[sceneId]) ? links[sceneId] : [];
    for (const stageId of stageIds) {
      if (typeof stageId !== "string") continue;
      const stage = projectedNodes[stageId];
      if (!isRecord(stage) || stage.type !== "container") continue;
      const projectedStage = { ...stage };
      delete projectedStage.fill;
      delete projectedStage.fill_paints;
      projectedNodes[stageId] = projectedStage;
    }
    const projectedDocument = {
      ...document,
      nodes: projectedNodes,
    };
    return io.GRID.encode(projectedDocument as never, schemaVersion);
  } catch (cause) {
    throw new LiveSceneRuntimeError(
      "background-projection-failed",
      `The live scene archive could not project scene ${sceneId} for external media.`,
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

function afterFinalAnimationFrame(callback: () => void): void {
  if (typeof requestAnimationFrame !== "function") {
    setTimeout(callback, 0);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => callback()));
}

function ownLiveSceneSurface(
  surface: LiveSceneSurface,
  afterDispose?: () => void
): OwnedLiveSceneSurface {
  let disposed = false;
  return {
    surface,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      let disposeError: unknown;
      try {
        surface.dispose();
      } catch (error: unknown) {
        disposeError = error;
      }
      try {
        afterDispose?.();
      } catch (releaseError: unknown) {
        if (disposeError === undefined) throw releaseError;
      }
      if (disposeError !== undefined) throw disposeError;
    },
  };
}

function releaseWebGLContextAfterStop(
  registry: EmscriptenGLContextRegistry,
  handle: number
): void {
  afterFinalAnimationFrame(() => {
    if (registry.currentContext?.handle === handle) {
      registry.makeContextCurrent(0);
    }
    registry.deleteContext(handle);
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

interface LiveSceneNodeChange {
  id: string;
  previous: LiveSceneNode;
  next: LiveSceneNode;
  previousBytes: Uint8Array;
  nextBytes: Uint8Array;
}

class LiveSceneRuntime {
  private readonly surface: LiveSceneSurface;
  private readonly disposeSurface: () => void;
  private readonly canvas: HTMLCanvasElement;
  private readonly dpr: number;
  private readonly encodeNode: (node: LiveSceneNode) => Uint8Array;
  private readonly afterPaint: () => Promise<void>;
  private readonly snapshot: LiveSceneSnapshot;
  private readonly canonicalNodes: Record<string, LiveSceneNode>;
  private readonly nodes: Record<string, LiveSceneNode>;
  private readonly patchedNodeIds = new Set<string>();
  private activeSceneId: string;
  private activeNodeIds: ReadonlySet<string>;
  private disposed = false;
  private mutationQueue: Promise<void> = Promise.resolve();
  private readonly stats: LiveSceneDiagnostics;

  constructor(
    surface: LiveSceneSurface,
    disposeSurface: () => void,
    canvas: HTMLCanvasElement,
    dpr: number,
    snapshot: LiveSceneSnapshot,
    sceneId: string,
    encodeNode: (node: LiveSceneNode) => Uint8Array,
    afterPaint: () => Promise<void>,
    stats: LiveSceneDiagnostics
  ) {
    this.surface = surface;
    this.disposeSurface = disposeSurface;
    this.canvas = canvas;
    this.dpr = dpr;
    this.encodeNode = encodeNode;
    this.afterPaint = afterPaint;
    this.snapshot = snapshot;
    this.canonicalNodes = Object.fromEntries(
      Object.entries(snapshot.document.nodes).map(([id, node]) => [
        id,
        { ...node },
      ])
    );
    this.nodes = Object.fromEntries(
      Object.entries(this.canonicalNodes).map(([id, node]) => [id, { ...node }])
    );
    this.activeSceneId = sceneId;
    this.activeNodeIds = descendants(snapshot, sceneId);
    this.stats = stats;
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new LiveSceneRuntimeError(
        "runtime-disposed",
        "The live scene runtime has been disposed."
      );
    }
  }

  private poison(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.disposeSurface();
    } catch {
      // The integrity failure that forced disposal remains authoritative.
    }
  }

  private enqueueMutation(operation: () => Promise<void>): Promise<void> {
    const pending = this.mutationQueue.then(operation, operation);
    this.mutationQueue = pending.catch(() => {});
    return pending;
  }

  private patchIds(patch: LiveScenePatch): string[] {
    return [
      ...new Set([
        ...Object.keys(patch.text ?? {}),
        ...Object.keys(patch.textStyles ?? {}),
        ...Object.keys(patch.visibility ?? {}),
      ]),
    ].sort();
  }

  private planNodeChanges(
    patch: LiveScenePatch,
    allowedNodeIds: ReadonlySet<string>,
    resetToCanonical: boolean
  ): LiveSceneNodeChange[] {
    const patchIds = this.patchIds(patch);
    for (const id of patchIds) {
      const current = this.nodes[id];
      if (!current) {
        this.stats.patchFailures += 1;
        throw new LiveSceneRuntimeError(
          "patch-node-missing",
          `The live patch target ${id} is not in the active document.`
        );
      }
      if (!allowedNodeIds.has(id)) {
        this.stats.patchFailures += 1;
        throw new LiveSceneRuntimeError(
          "patch-node-outside-scene",
          `The live patch target ${id} is outside the active scene.`
        );
      }
      if (
        patch.text &&
        Object.prototype.hasOwnProperty.call(patch.text, id) &&
        current.type !== "text" &&
        current.type !== "tspan"
      ) {
        this.stats.patchFailures += 1;
        throw new LiveSceneRuntimeError(
          "patch-node-type",
          `The live text patch target ${id} is not a text node.`
        );
      }
    }

    const changes: LiveSceneNodeChange[] = [];
    for (const id of patchIds) {
      const previous = resetToCanonical
        ? this.canonicalNodes[id]
        : this.nodes[id];
      const base = previous;
      if (!previous || !base) continue;
      let next: LiveSceneNode;
      try {
        next = projectLiveSceneNode(base, id, patch);
      } catch (error) {
        this.stats.patchFailures += 1;
        throw error;
      }
      changes.push({
        id,
        previous,
        next,
        previousBytes: this.encodeNode(previous),
        nextBytes: this.encodeNode(next),
      });
    }
    return changes;
  }

  private commitNodeChanges(
    changes: readonly LiveSceneNodeChange[],
    updateNodes = true
  ): void {
    const attempted: LiveSceneNodeChange[] = [];
    let failure: { change: LiveSceneNodeChange; cause: unknown } | undefined;
    for (const change of changes) {
      attempted.push(change);
      try {
        if (!this.surface.replaceNode(change.nextBytes)) {
          throw new LiveSceneRuntimeError(
            "patch-rejected",
            `The engine rejected the atomic live patch at ${change.id}.`
          );
        }
      } catch (cause: unknown) {
        failure = { change, cause };
        break;
      }
    }
    if (failure) {
      let rollbackCause: unknown;
      for (const change of [...attempted].reverse()) {
        try {
          if (!this.surface.replaceNode(change.previousBytes)) {
            throw new Error(
              `The engine rejected rollback for live node ${change.id}.`
            );
          }
        } catch (error: unknown) {
          rollbackCause ??= error;
        }
      }
      this.stats.patchFailures += 1;
      if (rollbackCause !== undefined) {
        // The JS mirror can no longer prove equality with the engine graph.
        // Poison this owner rather than allowing a later cue to build on a
        // partially mutated surface.
        this.poison();
        throw new LiveSceneRuntimeError(
          "patch-rollback-failed",
          `The engine could not restore the atomic live patch at ${failure.change.id}.`,
          { cause: rollbackCause }
        );
      }
      if (failure.cause instanceof LiveSceneRuntimeError) throw failure.cause;
      throw new LiveSceneRuntimeError(
        "patch-rejected",
        `The engine threw while applying the atomic live patch at ${failure.change.id}.`,
        { cause: failure.cause }
      );
    }
    if (updateNodes) {
      for (const change of changes) this.nodes[change.id] = change.next;
    }
  }

  private activeOverrides(nodeIds: ReadonlySet<string>): LiveSceneNodeChange[] {
    return [...this.patchedNodeIds]
      .filter((id) => nodeIds.has(id))
      .sort()
      .flatMap((id) => {
        const canonical = this.canonicalNodes[id];
        const current = this.nodes[id];
        if (!canonical || !current) return [];
        return [
          {
            id,
            previous: canonical,
            next: current,
            previousBytes: this.encodeNode(canonical),
            nextBytes: this.encodeNode(current),
          },
        ];
      });
  }

  /** Build one complete replacement for the retained active graph. Targets
   * patched by the prior cue but omitted by the next cue are restored from the
   * immutable canonical snapshot; requested targets are projected from that
   * same snapshot. `previous` always mirrors the graph currently owned by the
   * engine so commitNodeChanges can roll back an interrupted transaction. */
  private planActiveSceneProjection(
    patch: LiveScenePatch
  ): LiveSceneNodeChange[] {
    const requestedChanges = this.planNodeChanges(
      patch,
      this.activeNodeIds,
      true
    );
    const requestedById = new Map(
      requestedChanges.map((change) => [change.id, change] as const)
    );
    const targetIds = [
      ...new Set([
        ...[...this.patchedNodeIds].filter((id) => this.activeNodeIds.has(id)),
        ...requestedById.keys(),
      ]),
    ].sort();

    return targetIds.map((id) => {
      const previous = this.nodes[id];
      const canonical = this.canonicalNodes[id];
      if (!previous || !canonical) {
        this.stats.patchFailures += 1;
        throw new LiveSceneRuntimeError(
          "patch-node-missing",
          `The live patch target ${id} is not in the active document.`
        );
      }
      const next = requestedById.get(id)?.next ?? { ...canonical };
      return {
        id,
        previous,
        next,
        previousBytes: this.encodeNode(previous),
        nextBytes: this.encodeNode(next),
      };
    });
  }

  private rollbackNodeChanges(changes: readonly LiveSceneNodeChange[]): void {
    this.commitNodeChanges(
      [...changes].reverse().map((change) => ({
        id: change.id,
        previous: change.next,
        next: change.previous,
        previousBytes: change.nextBytes,
        nextBytes: change.previousBytes,
      })),
      false
    );
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

  /** Activates one complete cue projection from canonical nodes, then paints
   * exactly once. Cross-scene cues switch to the target's immutable clone;
   * same-scene cues atomically reproject the retained renderer graph because
   * reselecting an already-active engine scene can discard node replacement. */
  activateScene(sceneId: string, patch: LiveScenePatch = {}): Promise<void> {
    return this.enqueueMutation(async () => {
      this.assertNotDisposed();
      if (this.snapshot.document.nodes[sceneId]?.type !== "scene") {
        throw new LiveSceneRuntimeError(
          "missing-scene",
          `The target scene ${sceneId} is not in the canonical document.`
        );
      }
      if (!this.surface.loadedSceneIds().includes(sceneId)) {
        throw new LiveSceneRuntimeError(
          "missing-scene",
          `The engine did not decode target scene ${sceneId}.`
        );
      }

      if (sceneId === this.activeSceneId) {
        const changes = this.planActiveSceneProjection(patch);
        let committed = false;
        try {
          this.commitNodeChanges(changes, false);
          committed = true;
          fitCamera(this.surface, this.canvas, this.dpr);
          this.surface.redraw();
          await this.afterPaint();
        } catch (error) {
          if (!committed) throw error;
          try {
            this.rollbackNodeChanges(changes);
            fitCamera(this.surface, this.canvas, this.dpr);
            this.surface.redraw();
            await this.afterPaint();
          } catch (rollbackCause) {
            this.poison();
            throw new LiveSceneRuntimeError(
              "activation-rollback-failed",
              `The runtime could not restore scene ${sceneId} after activation failed.`,
              { cause: rollbackCause }
            );
          }
          throw error;
        }

        for (const change of changes) this.nodes[change.id] = change.next;
        for (const id of this.activeNodeIds) this.patchedNodeIds.delete(id);
        const patchIds = this.patchIds(patch);
        for (const id of patchIds) this.patchedNodeIds.add(id);
        if (patchIds.length > 0) this.stats.patchesApplied += 1;
        return;
      }

      const targetNodeIds = descendants(this.snapshot, sceneId);
      const changes = this.planNodeChanges(patch, targetNodeIds, true);
      const previousSceneId = this.activeSceneId;
      const previousNodeIds = this.activeNodeIds;
      const previousOverrides = this.activeOverrides(previousNodeIds);
      try {
        // switchScene clones the immutable scene held by the engine. Node
        // replacement only targets the currently selected renderer graph, so
        // overrides must follow the switch. No RAF can interleave this
        // synchronous sequence, and redraw happens only after every override.
        this.surface.switchScene(sceneId);
        this.commitNodeChanges(changes, false);
        this.activeSceneId = sceneId;
        this.activeNodeIds = targetNodeIds;
        fitCamera(this.surface, this.canvas, this.dpr);
        this.surface.redraw();
        await this.afterPaint();
      } catch (error) {
        try {
          this.surface.switchScene(previousSceneId);
          this.commitNodeChanges(previousOverrides, false);
          this.activeSceneId = previousSceneId;
          this.activeNodeIds = previousNodeIds;
          fitCamera(this.surface, this.canvas, this.dpr);
          this.surface.redraw();
        } catch (rollbackCause) {
          this.poison();
          throw new LiveSceneRuntimeError(
            "activation-rollback-failed",
            `The runtime could not restore scene ${previousSceneId} after activation failed.`,
            { cause: rollbackCause }
          );
        }
        throw error;
      }

      for (const id of targetNodeIds) {
        const canonical = this.canonicalNodes[id];
        if (canonical) this.nodes[id] = { ...canonical };
      }
      for (const change of changes) this.nodes[change.id] = change.next;
      for (const id of targetNodeIds) this.patchedNodeIds.delete(id);
      const patchIds = this.patchIds(patch);
      for (const id of patchIds) this.patchedNodeIds.add(id);
      if (patchIds.length > 0) this.stats.patchesApplied += 1;
    });
  }

  applyPatch(patch: LiveScenePatch): Promise<void> {
    return this.enqueueMutation(async () => {
      this.assertNotDisposed();
      const changes = this.planNodeChanges(patch, this.activeNodeIds, false);
      if (changes.length === 0) return;
      this.commitNodeChanges(changes);
      for (const id of this.patchIds(patch)) this.patchedNodeIds.add(id);
      this.surface.redraw();
      await this.afterPaint();
      this.stats.patchesApplied += 1;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeSurface();
  }
}

export async function createLiveSceneRuntime(
  options: CreateLiveSceneRuntimeOptions
): Promise<LiveSceneRuntime> {
  throwIfAborted(options.signal);
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
  const presentationDocument = projectLiveSceneArchiveBackground(
    archive.document,
    options.sceneId,
    options.transparentSceneBackground === true,
    options.expectedSchemaVersion
  );
  const dpr = Math.max(0.25, Math.min(8, options.dpr ?? 1));
  let ownedSurface: OwnedLiveSceneSurface | undefined;
  try {
    const acquiredSurface = await awaitAbortable<OwnedLiveSceneSurface>(
      () =>
        options.createSurface
          ? options
              .createSurface(options.signal)
              .then((surface) => ownLiveSceneSurface(surface))
          : (async () => {
              const factory = await init(
                options.locateFile
                  ? { locateFile: options.locateFile }
                  : undefined
              );
              throwIfAborted(options.signal);
              const surface = factory.createWebGLCanvasSurface(options.canvas, {
                use_embedded_fonts: true,
                config: { skip_layout: false },
              }) as LiveSceneSurface;
              const registry = factory.module.GL;
              const contextHandle = registry.currentContext?.handle;
              return ownLiveSceneSurface(
                surface,
                typeof contextHandle === "number" && contextHandle > 0
                  ? () => releaseWebGLContextAfterStop(registry, contextHandle)
                  : undefined
              );
            })(),
      options.signal,
      (lateSurface) => lateSurface.dispose()
    );
    ownedSurface = acquiredSurface;
    throwIfAborted(options.signal);
    const surface = acquiredSurface.surface;
    const stats: LiveSceneDiagnostics = {
      archiveLoads: 0,
      patchesApplied: 0,
      patchFailures: 0,
      firstFrameMs: 0,
      unresolvedImages: [],
      unresolvedFonts: [],
    };
    surface.loadSceneGrida(presentationDocument);
    stats.archiveLoads = 1;
    if (!surface.loadedSceneIds().includes(options.sceneId)) {
      throw new LiveSceneRuntimeError(
        "missing-scene",
        `The engine did not decode target scene ${options.sceneId}.`
      );
    }
    const registeredImages = new Set<string>();
    for (const [filename, bytes] of Object.entries(archive.images)) {
      const resourceId = resourceIdForArchiveImage(filename);
      surface.resolveImage(resourceId, bytes);
      registeredImages.add(resourceId);
    }
    const attemptedExternalImages = new Set<string>();
    const unresolvedImages = new Set<string>();
    const resolveExternalImage = async (resourceId: string): Promise<void> => {
      if (
        registeredImages.has(resourceId) ||
        attemptedExternalImages.has(resourceId)
      )
        return;
      attemptedExternalImages.add(resourceId);
      const bytes = options.resolveImage
        ? await awaitAbortable(
            () => options.resolveImage!(resourceId, options.signal),
            options.signal
          )
        : null;
      throwIfAborted(options.signal);
      if (bytes) {
        surface.resolveImage(resourceId, bytes);
        registeredImages.add(resourceId);
        unresolvedImages.delete(resourceId);
      } else {
        unresolvedImages.add(resourceId);
      }
    };
    // Scene activation is synchronous by contract, so every image referenced
    // anywhere in the immutable document must be hydrated during boot.
    for (const sceneId of snapshot.document.scenes_ref) {
      for (const resourceId of collectLiveSceneImageResources(
        snapshot,
        sceneId
      )) {
        await resolveExternalImage(resourceId);
      }
    }
    if (unresolvedImages.size > 0) {
      stats.unresolvedImages = [...unresolvedImages].sort();
      throw new LiveSceneRuntimeError(
        "missing-image",
        `The live scene is missing ${unresolvedImages.size} image resource(s).`
      );
    }

    const requestedFonts = new Set<string>();
    for (const sceneId of snapshot.document.scenes_ref) {
      for (const family of collectLiveSceneFontFamilies(snapshot, sceneId)) {
        requestedFonts.add(family);
      }
    }
    const unresolvedFonts = new Set(
      await hydrateSceneFonts({
        surface,
        requestedFonts,
        fallbackFonts: options.fallbackFonts,
        resolveFont: options.resolveFont,
        signal: options.signal,
      })
    );
    throwIfAborted(options.signal);
    stats.unresolvedFonts = [...unresolvedFonts].sort();
    if (unresolvedFonts.size > 0 && !options.fallbackFonts?.length) {
      throw new LiveSceneRuntimeError(
        "missing-font",
        `The live scene is missing ${unresolvedFonts.size} font family or families.`
      );
    }

    // No renderable scene is selected until every declarative document
    // resource is registered. switchScene queues the engine frame, so this
    // ordering prevents even a provisional fallback-font/image paint.
    surface.switchScene(options.sceneId);
    surface.runtime_renderer_set_isolation_stage_preset?.(0);
    surface.resize(options.canvas.width, options.canvas.height);
    fitCamera(surface, options.canvas, dpr);
    surface.redraw();
    const afterPaint = options.afterPaint ?? defaultAfterPaint;
    await awaitAbortable(() => afterPaint(options.signal), options.signal);
    throwIfAborted(options.signal);

    for (const resourceId of surface.drainMissingImages()) {
      await resolveExternalImage(resourceId);
    }
    if (unresolvedImages.size > 0) {
      stats.unresolvedImages = [...unresolvedImages].sort();
      throw new LiveSceneRuntimeError(
        "missing-image",
        `The live scene is missing ${stats.unresolvedImages.length} image resource(s).`
      );
    }

    const supplementalFonts = new Set<string>();
    for (const { family } of surface.listMissingFonts()) {
      const normalized = family.trim();
      if (!normalized) continue;
      if (requestedFonts.has(normalized)) unresolvedFonts.add(normalized);
      else supplementalFonts.add(normalized);
    }
    for (const family of await hydrateSceneFonts({
      surface,
      requestedFonts: supplementalFonts,
      resolveFont: options.resolveFont,
      signal: options.signal,
    })) {
      unresolvedFonts.add(family);
    }
    throwIfAborted(options.signal);
    stats.unresolvedFonts = [...unresolvedFonts].sort();
    if (unresolvedFonts.size > 0 && !options.fallbackFonts?.length) {
      throw new LiveSceneRuntimeError(
        "missing-font",
        `The live scene is missing ${unresolvedFonts.size} font family or families.`
      );
    }

    surface.redraw();
    await awaitAbortable(() => afterPaint(options.signal), options.signal);
    throwIfAborted(options.signal);
    stats.firstFrameMs = Math.max(0, performance.now() - startedAt);
    const runtime = new LiveSceneRuntime(
      surface,
      acquiredSurface.dispose,
      options.canvas,
      dpr,
      snapshot,
      options.sceneId,
      options.encodeNode ?? ((node) => io.GRID.encodeNode(node as never)),
      () => afterPaint(),
      stats
    );
    ownedSurface = undefined;
    return runtime;
  } catch (error) {
    try {
      ownedSurface?.dispose();
    } catch {
      // Cleanup must not mask the boot/validation failure that triggered it.
    }
    throw error;
  }
}

export type LiveSceneRuntimeInstance = Awaited<
  ReturnType<typeof createLiveSceneRuntime>
>;
