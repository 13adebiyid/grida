/**
 * Validate the Bible Helper host origin used as a postMessage target.
 *
 * Browser-hosted development keeps the existing http(s) contract. Packaged
 * Rhema serves both host and editor from one registered standard custom
 * scheme, so a non-network origin is accepted only when it is non-opaque and
 * exactly matches the editor's own origin. This permits `rhema-app://app`
 * without turning arbitrary custom schemes or authorities into message
 * targets.
 */
export function validateRhemaParentOrigin(
  value: string | null | undefined,
  currentOrigin: string | null | undefined
): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
    // Node's WHATWG URL implementation reports an opaque `null` origin for
    // custom schemes, while Electron reports the registered standard scheme's
    // real origin. Reconstruct only the authority form for test/runtime parity;
    // credentials and hostless schemes stay rejected.
    const customOrigin =
      parsed.username || parsed.password || !parsed.host
        ? undefined
        : parsed.origin !== "null"
          ? parsed.origin
          : `${parsed.protocol}//${parsed.host}`;
    if (
      customOrigin &&
      typeof currentOrigin === "string" &&
      currentOrigin !== "null" &&
      customOrigin === currentOrigin
    ) {
      return customOrigin;
    }
  } catch {
    // Malformed origins fail closed.
  }
  return undefined;
}
