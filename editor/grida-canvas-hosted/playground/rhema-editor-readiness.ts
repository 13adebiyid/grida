const SHA256_RE = /^[a-f0-9]{64}$/;

export const EDITOR_OPEN_READINESS_TIMEOUT_MS = 5000;

interface ReadinessDocument {
  nodes: Record<string, unknown>;
  links: Record<string, readonly string[] | undefined>;
  external_assets?: Record<string, { kind?: unknown } | undefined>;
}

function resourceDigest(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^res:\/\/(?:images|videos)\/([a-f0-9]{64})$/.exec(value);
  return match && SHA256_RE.test(match[1]) ? match[1] : null;
}

/** Collect host-owned media needed to paint the currently visible scene. */
export function collectSceneExternalAssetRefs(
  document: ReadinessDocument,
  sceneId: string | null | undefined
): string[] {
  if (!sceneId) return [];
  const refs = new Set<string>();
  const pending = [...(document.links[sceneId] ?? [])];
  const visited = new Set<string>();

  const add = (value: unknown) => {
    const digest = resourceDigest(value);
    if (digest && document.external_assets?.[digest]) {
      refs.add(digest);
    }
  };
  const addPaint = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const paint = value as { type?: unknown; src?: unknown };
    if (paint.type === "image") add(paint.src);
  };

  while (pending.length > 0) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = document.nodes[id];
    if (node && typeof node === "object") {
      const candidate = node as {
        type?: unknown;
        src?: unknown;
        asset_digest?: unknown;
        poster?: unknown;
        poster_asset_digest?: unknown;
        fill?: unknown;
        fill_paints?: unknown;
      };
      if (candidate.type === "image" || candidate.type === "video") {
        add(candidate.src);
      }
      if (
        typeof candidate.asset_digest === "string" &&
        document.external_assets?.[candidate.asset_digest]
      ) {
        refs.add(candidate.asset_digest);
      }
      add(candidate.poster);
      if (
        typeof candidate.poster_asset_digest === "string" &&
        document.external_assets?.[candidate.poster_asset_digest]
      ) {
        refs.add(candidate.poster_asset_digest);
      }
      addPaint(candidate.fill);
      if (Array.isArray(candidate.fill_paints)) {
        candidate.fill_paints.forEach(addPaint);
      }
    }
    pending.push(...(document.links[id] ?? []));
  }

  return [...refs].sort();
}

/** Collect only image bytes that must be hydrated into the canvas backend. */
export function collectSceneExternalImageRefs(
  document: ReadinessDocument,
  sceneId: string | null | undefined
): string[] {
  return collectSceneExternalAssetRefs(document, sceneId).filter(
    (ref) => document.external_assets?.[ref]?.kind === "image"
  );
}

export interface EditorOpenReadiness {
  documentReady: boolean;
  canvasReady: boolean;
  hostHydrationRequired: boolean;
  fontCatalogSettled: boolean;
  assetLocationsSettled: boolean;
  initialImagesSettled: boolean;
  timedOut: boolean;
}

export function isEditorOpenReady(value: EditorOpenReadiness): boolean {
  if (!value.documentReady || !value.canvasReady) return false;
  if (!value.hostHydrationRequired) return true;
  if (value.timedOut) return true;
  return (
    value.fontCatalogSettled &&
    value.assetLocationsSettled &&
    value.initialImagesSettled
  );
}
