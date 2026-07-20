export type RhemaDocumentAuthority = "host-canonical" | "opfs-cache";

/**
 * Canonical native sessions must hydrate from Rhema's content-addressed
 * document ref on every open. OPFS may contain the pre-canonical scene ids
 * written before Rhema repacked the last save, so treating it as authoritative
 * can reopen a different document even though preview/live are correct.
 */
export function rhemaDocumentAuthority(
  canonicalNativeDocument: boolean
): RhemaDocumentAuthority {
  return canonicalNativeDocument ? "host-canonical" : "opfs-cache";
}
