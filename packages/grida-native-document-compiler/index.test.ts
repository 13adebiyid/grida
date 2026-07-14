import { describe, expect, it } from "vitest";
import { compilerIO } from "@grida/io/compiler";
import {
  compileNativeDocument,
  NATIVE_COMPILER_CONTRACT_DESCRIPTOR,
  NATIVE_COMPILER_CONTRACT_HASH,
  type GridaImportDocumentV1,
} from "./index";

const red = { kind: "solid" as const, color: { r: 1, g: 0, b: 0, a: 1 } };

function fixture(): GridaImportDocumentV1 {
  const bytes = new TextEncoder().encode("asset");
  void bytes;
  return {
    version: 1,
    rangeUnit: "utf16-code-units",
    importKey: "deck-1",
    name: "Fixture",
    stage: { width: 1920, height: 1080 },
    assets: [
      {
        importKey: "photo",
        digest: "d".repeat(64),
        kind: "image",
        mimeType: "image/png",
        displayName: "Photo.png",
        bytes: 5,
      },
    ],
    scenes: [
      {
        importKey: "slide-1",
        name: "Slide 1",
        background: red,
        nodes: [
          {
            kind: "rectangle",
            importKey: "box",
            name: "Box",
            frame: { x: 10, y: 20, width: 300, height: 200, rotation: 12 },
            fill: red,
          },
          {
            kind: "text",
            importKey: "title",
            name: "Title",
            frame: { x: 100, y: 100, width: 800, height: 200 },
            text: "Hi 👋",
            defaultStyle: { fontFamily: "Inter", fontSize: 72, fill: red },
            runs: [
              {
                start: 0,
                end: 3,
                style: { fontFamily: "Inter", fontSize: 72, fill: red },
              },
              {
                start: 3,
                end: 5,
                style: {
                  fontFamily: "Inter",
                  fontSize: 90,
                  italic: true,
                  fill: red,
                },
              },
            ],
          },
          {
            kind: "image",
            importKey: "portrait",
            name: "Portrait",
            frame: { x: 1000, y: 100, width: 500, height: 700 },
            assetDigest: "d".repeat(64),
          },
          {
            kind: "vector",
            importKey: "custom-path",
            name: "Custom path",
            frame: { x: 40, y: 40, width: 200, height: 160 },
            fill: red,
            network: {
              vertices: [
                { x: 0, y: 0 },
                { x: 200, y: 160 },
              ],
              segments: [
                {
                  a: 0,
                  b: 1,
                  ta: { x: 30, y: 0 },
                  tb: { x: -30, y: 0 },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("native document compiler", () => {
  it("is deterministic and preserves native layers through archive reopen", async () => {
    const first = await compileNativeDocument(fixture());
    const second = await compileNativeDocument(fixture());
    expect(first.semanticHash).toBe(second.semanticHash);
    expect(first.archiveHash).toBe(second.archiveHash);
    expect(first.sourceMap).toEqual(second.sourceMap);
    const unpacked = compilerIO.unpack(first.archive);
    const reopened = compilerIO.decode(unpacked.document);
    expect(Object.values(reopened.nodes).map((node) => node.type)).toEqual(
      expect.arrayContaining([
        "scene",
        "container",
        "rectangle",
        "text",
        "vector",
      ])
    );
    expect(reopened.external_assets?.["d".repeat(64)]?.display_name).toBe(
      "Photo.png"
    );
  });

  it("rejects invalid references and invalid rich-text ranges", async () => {
    const missing = fixture();
    (missing.scenes[0]!.nodes[2] as { assetDigest: string }).assetDigest =
      "e".repeat(64);
    await expect(compileNativeDocument(missing)).rejects.toMatchObject({
      code: "INVALID_ASSET_REFERENCE",
    });

    const badRuns = fixture();
    const text = badRuns.scenes[0]!.nodes[1] as Extract<
      (typeof badRuns.scenes)[number]["nodes"][number],
      { kind: "text" }
    >;
    text.runs![1]!.start = 2;
    await expect(compileNativeDocument(badRuns)).rejects.toMatchObject({
      code: "INVALID_TEXT_RUNS",
    });

    const badVector = fixture();
    const vector = badVector.scenes[0]!.nodes[3] as Extract<
      (typeof badVector.scenes)[number]["nodes"][number],
      { kind: "vector" }
    >;
    vector.network.segments[0]!.b = 99;
    await expect(compileNativeDocument(badVector)).rejects.toMatchObject({
      code: "INVALID_VECTOR_NETWORK",
    });
  });

  it("honors cancellation and locks the published contract descriptor", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      compileNativeDocument(fixture(), { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    const bytes = new TextEncoder().encode(NATIVE_COMPILER_CONTRACT_DESCRIPTOR);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    expect(actual).toBe(NATIVE_COMPILER_CONTRACT_HASH);
  });
});
