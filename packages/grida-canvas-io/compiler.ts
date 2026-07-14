import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import grida from "@grida/schema";
import { format } from "./format";

/** Minimal production-codec surface for deterministic document compilers. */
export namespace compilerIO {
  const ASSET_PATH_RE = /^(?:images|bitmaps)\/[^/]+$/;

  export function encode(
    document: grida.program.document.Document,
    schemaVersion = grida.program.document.SCHEMA_VERSION
  ): Uint8Array {
    return format.document.encode.toFlatbuffer(
      { ...document, images: {}, bitmaps: {} },
      schemaVersion
    );
  }

  export function decode(bytes: Uint8Array): grida.program.document.Document {
    return {
      ...format.document.decode.fromFlatbuffer(bytes),
      images: {},
      bitmaps: {},
    };
  }

  export function snapshot(
    document: grida.program.document.Document,
    schemaVersion = grida.program.document.SCHEMA_VERSION
  ): string {
    const {
      images: _images,
      bitmaps: _bitmaps,
      ...persistedDocument
    } = document;
    return JSON.stringify({
      version: schemaVersion,
      document: persistedDocument,
    });
  }

  export function pack(
    document: grida.program.document.Document,
    schemaVersion = grida.program.document.SCHEMA_VERSION
  ): Uint8Array {
    return zipSync(
      {
        "manifest.json": strToU8(
          JSON.stringify({
            document_file: "document.grida",
            version: schemaVersion,
          })
        ),
        "document.grida": encode(document, schemaVersion),
        "document.grida1": strToU8(snapshot(document, schemaVersion)),
      },
      { level: 6 }
    );
  }

  /** Re-encode a canonical JSON snapshot and carry forward only embedded
   * image/bitmap payloads from trusted prior archives. This is used after a
   * three-way document merge so the FlatBuffer, JSON sidecar, and asset set
   * are committed as one coherent archive. */
  export function repack(
    snapshotJson: string,
    assetArchives: readonly Uint8Array[] = []
  ): {
    archive: Uint8Array;
    snapshotJson: string;
    document: grida.program.document.Document;
  } {
    const model = JSON.parse(snapshotJson) as {
      version?: unknown;
      document?: unknown;
    };
    if (
      model.version !== grida.program.document.SCHEMA_VERSION ||
      !model.document ||
      typeof model.document !== "object" ||
      Array.isArray(model.document)
    ) {
      throw new Error("snapshot schema is incompatible with the compiler ABI");
    }
    const canonical = decode(
      encode(
        {
          ...(model.document as grida.program.document.Document),
          images: {},
          bitmaps: {},
        },
        model.version
      )
    );
    const canonicalSnapshot = snapshot(canonical, model.version);
    const files: Record<string, Uint8Array> = {
      "manifest.json": strToU8(
        JSON.stringify({
          document_file: "document.grida",
          version: model.version,
        })
      ),
      "document.grida": encode(canonical, model.version),
      "document.grida1": strToU8(canonicalSnapshot),
    };
    for (const archive of assetArchives) {
      const source = unzipSync(archive);
      for (const [path, bytes] of Object.entries(source)) {
        if (!ASSET_PATH_RE.test(path)) continue;
        const prior = files[path];
        if (
          prior &&
          (prior.byteLength !== bytes.byteLength ||
            prior.some((byte, index) => byte !== bytes[index]))
        ) {
          throw new Error(`embedded asset collision at ${path}`);
        }
        files[path] = bytes;
      }
    }
    return {
      archive: zipSync(files, { level: 6 }),
      snapshotJson: canonicalSnapshot,
      document: canonical,
    };
  }

  export function unpack(archive: Uint8Array): {
    document: Uint8Array;
    manifest: { document_file: string; version?: string };
    snapshotJson: string;
  } {
    const files = unzipSync(archive);
    const document = files["document.grida"];
    const manifestBytes = files["manifest.json"];
    const snapshotBytes = files["document.grida1"];
    if (!document || !manifestBytes || !snapshotBytes) {
      throw new Error("invalid compiler archive: required entry missing");
    }
    return {
      document,
      manifest: JSON.parse(strFromU8(manifestBytes)) as {
        document_file: string;
        version?: string;
      },
      snapshotJson: strFromU8(snapshotBytes),
    };
  }
}
