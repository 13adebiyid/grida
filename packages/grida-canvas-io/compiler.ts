import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import grida from "@grida/schema";
import { format } from "./format";

/** Minimal production-codec surface for deterministic document compilers. */
export namespace compilerIO {
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
