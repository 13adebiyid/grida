/**
 * Microsoft sensitivity-label text can be embedded as an ordinary PowerPoint
 * shape in ProPresenter exports. Preserve the node for round-trip provenance,
 * but make it inactive so it is neither rendered nor offered as slide content.
 */
export function suppressImportedContentMarkings<T>(document: T): T {
  if (!document || typeof document !== "object") return document;
  const nodes = (document as { nodes?: unknown }).nodes;
  if (!nodes || typeof nodes !== "object" || Array.isArray(nodes)) {
    return document;
  }
  let changed = false;
  const nextNodes: Record<string, unknown> = { ...nodes };
  for (const [id, raw] of Object.entries(nodes)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const node = raw as Record<string, unknown>;
    const name = typeof node.name === "string" ? node.name.trim() : "";
    const text = typeof node.text === "string" ? node.text.trim() : "";
    if (
      !/^msipcmcontentmarking$/i.test(name) &&
      !/^external use permitted$/i.test(text)
    ) {
      continue;
    }
    if (node.active === false) continue;
    nextNodes[id] = { ...node, active: false };
    changed = true;
  }
  return changed
    ? ({ ...(document as object), nodes: nextNodes } as T)
    : document;
}
