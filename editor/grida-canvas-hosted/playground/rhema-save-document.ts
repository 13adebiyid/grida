import { compilerIO } from "@grida/io/compiler";
import { io } from "@grida/io";
import grida from "@grida/schema";

export interface RhemaSaveDocumentPayload {
  archiveBytes: ArrayBuffer;
  snapshotJson: string;
}

/**
 * Serialize the editor's complete JSON state with an explicit schema version.
 * OPFS and crash drafts intentionally retain the editor repositories; their
 * image bytes are persisted separately by the caller.
 */
export function serializeRhemaEditorSnapshot(
  document: grida.program.document.Document
): string {
  return io.snapshot.stringify({
    version: grida.program.document.SCHEMA_VERSION,
    document,
  });
}

/**
 * Build the portable document pair sent across the Rhema host bridge.
 *
 * The archive and JSON sidecar must use the same production codec contract:
 * the native compiler rejects versionless snapshots and the sidecar is the
 * source of truth for JSON-only scene metadata that FlatBuffers cannot carry.
 */
export function buildRhemaSaveDocumentPayload(input: {
  document: grida.program.document.Document;
  images: Record<string, Uint8Array>;
}): RhemaSaveDocumentPayload {
  const schemaVersion = grida.program.document.SCHEMA_VERSION;
  const archive = io.archive.pack(input.document, input.images, schemaVersion);
  const standaloneArchive = Uint8Array.from(archive);
  return {
    archiveBytes: standaloneArchive.buffer,
    snapshotJson: compilerIO.snapshot(input.document, schemaVersion),
  };
}
