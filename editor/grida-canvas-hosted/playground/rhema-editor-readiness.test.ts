import { describe, expect, test } from "vitest";
import {
  collectSceneExternalAssetRefs,
  collectSceneExternalImageRefs,
  isEditorOpenReady,
} from "./rhema-editor-readiness";

const imageA = "a".repeat(64);
const imageB = "b".repeat(64);
const otherSceneImage = "c".repeat(64);
const videoDigest = "d".repeat(64);

describe("editor opening readiness", () => {
  test("collects only image resources used by the current scene", () => {
    const document = {
      nodes: {
        stage: { type: "container" },
        photo: {
          type: "rectangle",
          fill: { type: "image", src: `res://images/${imageA}` },
        },
        video: {
          type: "video",
          src: `res://videos/${videoDigest}`,
          asset_digest: videoDigest,
          poster: `res://images/${imageB}`,
        },
        other: {
          type: "rectangle",
          fill_paints: [
            { type: "image", src: `res://images/${otherSceneImage}` },
          ],
        },
      },
      links: {
        scene: ["stage"],
        stage: ["photo", "video"],
        otherScene: ["other"],
      },
      external_assets: {
        [imageA]: { kind: "image" },
        [imageB]: { kind: "image" },
        [otherSceneImage]: { kind: "image" },
        [videoDigest]: { kind: "video" },
      },
    };

    expect(collectSceneExternalImageRefs(document, "scene")).toEqual([
      imageA,
      imageB,
    ]);
    expect(collectSceneExternalAssetRefs(document, "scene")).toEqual([
      imageA,
      imageB,
      videoDigest,
    ]);
  });

  test("waits for host fonts and media after document and canvas are ready", () => {
    const base = {
      documentReady: true,
      canvasReady: true,
      hostHydrationRequired: true,
      fontCatalogSettled: true,
      assetLocationsSettled: true,
      initialImagesSettled: false,
      timedOut: false,
    };

    expect(isEditorOpenReady(base)).toBe(false);
    expect(isEditorOpenReady({ ...base, initialImagesSettled: true })).toBe(
      true
    );
  });

  test("the deadline unblocks the editor while retries continue", () => {
    expect(
      isEditorOpenReady({
        documentReady: true,
        canvasReady: true,
        hostHydrationRequired: true,
        fontCatalogSettled: false,
        assetLocationsSettled: false,
        initialImagesSettled: false,
        timedOut: true,
      })
    ).toBe(true);
  });

  test("non-hosted editors retain the original document-plus-canvas gate", () => {
    expect(
      isEditorOpenReady({
        documentReady: true,
        canvasReady: true,
        hostHydrationRequired: false,
        fontCatalogSettled: false,
        assetLocationsSettled: false,
        initialImagesSettled: false,
        timedOut: false,
      })
    ).toBe(true);
  });
});
