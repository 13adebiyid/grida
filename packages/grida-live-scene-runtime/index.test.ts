import { describe, expect, it, vi } from "vitest";
import { createLiveSceneRuntime, scanLiveSceneCapabilities } from "./index";

const snapshot = {
  version: "test-schema",
  document: {
    nodes: {
      scene: { id: "scene", type: "scene" },
      stage: {
        id: "stage",
        type: "container",
        layout_target_width: 1920,
        layout_target_height: 1080,
      },
      body: {
        id: "body",
        type: "text",
        text: "Authored",
        active: true,
        layout_target_width: 1200,
        layout_target_height: 500,
        text_align: "center",
        text_align_vertical: "center",
      },
      auto: {
        id: "auto",
        type: "tspan",
        text: "Auto authored",
        active: true,
        layout_target_width: "auto",
        layout_target_height: "auto",
        text_align: "center",
        text_align_vertical: "center",
      },
      video: { id: "video", type: "video" },
    },
    links: {
      scene: ["stage"],
      stage: ["body", "auto"],
    },
    scenes_ref: ["scene"],
    animations: {},
  },
};

function surface() {
  return {
    loadSceneGrida: vi.fn<(bytes: Uint8Array) => void>(),
    switchScene: vi.fn<(sceneId: string) => void>(),
    loadedSceneIds: vi.fn<() => string[]>(() => ["scene"]),
    drainMissingImages: vi.fn<() => string[]>(() => []),
    resolveImage: vi.fn<(resourceId: string, bytes: Uint8Array) => void>(),
    listMissingFonts: vi.fn<() => Array<{ family: string }>>(() => []),
    addFont: vi.fn<(family: string, bytes: Uint8Array) => void>(),
    replaceNode: vi.fn<(bytes: Uint8Array) => boolean>(() => true),
    getNodeAbsoluteBoundingBox: vi.fn<
      (target: string) => {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null
    >(() => ({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    })),
    setMainCameraTransform:
      vi.fn<
        (
          transform: [[number, number, number], [number, number, number]]
        ) => void
      >(),
    runtime_renderer_set_isolation_stage_preset:
      vi.fn<(preset: number) => void>(),
    resize: vi.fn<(width: number, height: number) => void>(),
    redraw: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
  };
}

describe("live scene runtime", () => {
  it("loads a document once and applies repeated atomic patches without reload", async () => {
    const fake = surface();
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: {
        document: new Uint8Array([1, 2, 3]),
        images: {},
      },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint: async () => {},
    });

    for (let index = 0; index < 100; index += 1) {
      await runtime.applyPatch({ text: { body: `Verse ${index}` } });
    }

    expect(fake.loadSceneGrida).toHaveBeenCalledTimes(1);
    expect(fake.replaceNode).toHaveBeenCalledTimes(100);
    expect(runtime.diagnostics()).toMatchObject({
      archiveLoads: 1,
      patchesApplied: 100,
      patchFailures: 0,
    });
  });

  it("preserves Grida alignment and auto-size properties across live text patches", async () => {
    const fake = surface();
    const encoded: Array<Record<string, unknown>> = [];
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      encodeNode: (node) => {
        encoded.push({ ...node });
        return new TextEncoder().encode(JSON.stringify(node));
      },
      afterPaint: async () => {},
    });

    await runtime.applyPatch({
      text: { body: "Centered scripture", auto: "Auto-sized scripture" },
    });

    const patchedBody = encoded.find(
      (node) => node.id === "body" && node.text === "Centered scripture"
    );
    const patchedAuto = encoded.find(
      (node) => node.id === "auto" && node.text === "Auto-sized scripture"
    );
    expect(patchedBody).toMatchObject({
      layout_target_width: 1200,
      layout_target_height: 500,
      text_align: "center",
      text_align_vertical: "center",
    });
    expect(patchedAuto).toMatchObject({
      layout_target_width: "auto",
      layout_target_height: "auto",
      text_align: "center",
      text_align_vertical: "center",
    });
  });

  it("rejects patches outside the selected scene", async () => {
    const fake = surface();
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: {
        ...snapshot,
        document: {
          ...snapshot.document,
          nodes: {
            ...snapshot.document.nodes,
            otherScene: { id: "otherScene", type: "scene" },
            otherText: { id: "otherText", type: "text", text: "Other" },
          },
          links: {
            ...snapshot.document.links,
            otherScene: ["otherText"],
          },
          scenes_ref: ["scene", "otherScene"],
        },
      },
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint: async () => {},
    });

    await expect(
      runtime.applyPatch({ text: { otherText: "Wrong scene" } })
    ).rejects.toMatchObject({ code: "patch-node-outside-scene" });
    expect(fake.replaceNode).not.toHaveBeenCalled();
  });

  it("rolls back every changed node when an atomic patch member fails", async () => {
    const fake = surface();
    fake.replaceNode
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: {
        ...snapshot,
        document: {
          ...snapshot.document,
          nodes: {
            ...snapshot.document.nodes,
            reference: { id: "reference", type: "text", text: "Ref" },
          },
          links: {
            ...snapshot.document.links,
            stage: ["body", "reference"],
          },
        },
      },
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint: async () => {},
    });

    await expect(
      runtime.applyPatch({
        text: { body: "New body", reference: "New ref" },
      })
    ).rejects.toMatchObject({ code: "patch-rejected" });
    expect(fake.replaceNode).toHaveBeenCalledTimes(3);
    expect(runtime.diagnostics().patchFailures).toBe(1);
  });

  it("allows document-driven video composition while keeping timed visual animation gated", () => {
    const withVideo = {
      ...snapshot,
      document: {
        ...snapshot.document,
        links: {
          ...snapshot.document.links,
          stage: ["body", "video"],
        },
      },
    };
    expect(scanLiveSceneCapabilities(withVideo, "scene")).toMatchObject({
      eligible: true,
      hasInSceneVideo: true,
      reason: "eligible",
    });

    const withAnimation = {
      ...snapshot,
      document: {
        ...snapshot.document,
        animations: {
          enter: { id: "enter", scene_id: "scene" },
        },
      },
    };
    expect(scanLiveSceneCapabilities(withAnimation, "scene")).toMatchObject({
      eligible: false,
      hasAnimation: true,
      reason: "animation",
    });
  });

  it("registers every resolved face for a missing font family", async () => {
    const fake = surface();
    fake.listMissingFonts.mockReturnValue([{ family: "Inter" }]);
    await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      resolveFont: async () => [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
      afterPaint: async () => {},
    });

    expect(fake.addFont).toHaveBeenCalledTimes(2);
    expect(fake.addFont).toHaveBeenNthCalledWith(
      1,
      "Inter",
      new Uint8Array([1, 2])
    );
    expect(fake.addFont).toHaveBeenNthCalledWith(
      2,
      "Inter",
      new Uint8Array([3, 4])
    );
  });
});
