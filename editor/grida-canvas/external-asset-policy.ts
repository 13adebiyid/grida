import type grida from "@grida/schema";

const SHA256_RE = /^[a-f0-9]{64}$/;

/**
 * Returns true only when an image ref is durably owned by the host CAS.
 * Invalid or mismatched metadata intentionally falls back to archive embedding
 * so a malformed external-asset record cannot cause data loss on save.
 */
export function isHostManagedImageRef(
  document: Pick<grida.program.document.Document, "external_assets">,
  ref: string
): boolean {
  if (!SHA256_RE.test(ref)) return false;
  const asset = document.external_assets?.[ref];
  return Boolean(
    asset &&
    asset.kind === "image" &&
    asset.digest === ref &&
    SHA256_RE.test(asset.digest)
  );
}
