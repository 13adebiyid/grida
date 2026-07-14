export const RESOLVE_EXTERNAL_ASSETS_REQUEST_TYPE =
  "bible-helper-resolve-external-assets";
export const RESOLVE_EXTERNAL_ASSETS_RESULT_TYPE =
  "bible-helper-resolve-external-assets-result";

const SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_ASSET_BYTES = 512 * 1024 * 1024;
const MAX_REFS_PER_REQUEST = 64;

export interface ExternalAssetLocation {
  ref: string;
  url: string;
  bytes: number;
  mimeType: string;
  name: string;
}

function trustedLocation(value: unknown): ExternalAssetLocation | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.ref !== "string" ||
    !SHA256_RE.test(item.ref) ||
    typeof item.url !== "string" ||
    typeof item.bytes !== "number" ||
    !Number.isSafeInteger(item.bytes) ||
    item.bytes < 0 ||
    item.bytes > MAX_ASSET_BYTES ||
    typeof item.mimeType !== "string" ||
    typeof item.name !== "string"
  ) {
    return null;
  }
  try {
    const url = new URL(item.url);
    if (
      url.protocol !== "rhema-local:" ||
      url.hostname !== "asset" ||
      !url.pathname.startsWith(`/${item.ref}/`)
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return item as unknown as ExternalAssetLocation;
}

export function requestExternalAssetLocations(
  parentOrigin: string,
  refs: readonly string[],
  timeoutMs = 5000
): Promise<ExternalAssetLocation[]> {
  if (typeof window === "undefined" || window.parent === window) {
    return Promise.resolve([]);
  }
  const requested = [...new Set(refs)]
    .filter((ref) => SHA256_RE.test(ref))
    .slice(0, MAX_REFS_PER_REQUEST);
  if (requested.length === 0) return Promise.resolve([]);
  const requestedSet = new Set(requested);
  const requestId = `assets-${crypto.randomUUID()}`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: ExternalAssetLocation[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== parentOrigin || event.source !== window.parent)
        return;
      const data = event.data as { type?: unknown; payload?: unknown } | null;
      if (!data || data.type !== RESOLVE_EXTERNAL_ASSETS_RESULT_TYPE) return;
      const payload = (data.payload ?? {}) as {
        requestId?: unknown;
        assets?: unknown;
      };
      if (payload.requestId !== requestId || !Array.isArray(payload.assets)) {
        return;
      }
      finish(
        payload.assets
          .map(trustedLocation)
          .filter((item): item is ExternalAssetLocation =>
            Boolean(item && requestedSet.has(item.ref))
          )
      );
    };
    const timer = setTimeout(() => finish([]), timeoutMs);
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      {
        type: RESOLVE_EXTERNAL_ASSETS_REQUEST_TYPE,
        payload: { requestId, refs: requested },
      },
      parentOrigin
    );
  });
}

export async function fetchVerifiedExternalAsset(
  location: ExternalAssetLocation,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const response = await fetch(location.url, { signal });
  if (!response.ok) throw new Error(`asset fetch failed (${response.status})`);
  const declaredLengthHeader = response.headers.get("content-length");
  const declaredLength =
    declaredLengthHeader === null ? null : Number(declaredLengthHeader);
  if (
    declaredLength !== null &&
    Number.isFinite(declaredLength) &&
    declaredLength >= 0 &&
    declaredLength !== location.bytes
  ) {
    throw new Error("asset length changed");
  }
  const buffer = await response.arrayBuffer();
  if (
    buffer.byteLength !== location.bytes ||
    buffer.byteLength > MAX_ASSET_BYTES
  ) {
    throw new Error("asset size mismatch");
  }
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const actual = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  if (actual !== location.ref) throw new Error("asset digest mismatch");
  return new Uint8Array(buffer);
}
