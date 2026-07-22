import { afterEach, describe, expect, it, vi } from "vitest";
import { io } from "@grida/io";
import grida from "@grida/schema";

const canvasWasmMocks = vi.hoisted(() => ({
  init: vi.fn<() => Promise<unknown>>(),
  createCanvas: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@grida/canvas-wasm", () => ({
  default: canvasWasmMocks.init,
  createCanvas: canvasWasmMocks.createCanvas,
}));

import {
  createLiveSceneRuntime,
  createLiveSceneThumbnailRenderer,
  projectLiveSceneArchiveBackground,
  scanLiveSceneCapabilities,
} from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

const multiSceneSnapshot = {
  version: "test-schema",
  document: {
    nodes: {
      sceneA: { id: "sceneA", type: "scene" },
      stageA: {
        id: "stageA",
        type: "container",
        layout_target_width: 1920,
        layout_target_height: 1080,
      },
      textA: {
        id: "textA",
        type: "text",
        text: "Scene A",
        default_style: { font_family: "Authored A", fill: "#ffffff" },
        styled_runs: [
          {
            start: 0,
            end: 7,
            style: { font_family: "Authored A", fill: "#ffffff" },
          },
        ],
      },
      sceneB: { id: "sceneB", type: "scene" },
      stageB: {
        id: "stageB",
        type: "container",
        layout_target_width: 1920,
        layout_target_height: 1080,
      },
      textB: {
        id: "textB",
        type: "text",
        text: "Scene B",
        default_style: { font_family: "Authored B", fill: "#ffd700" },
        styled_runs: [
          {
            start: 0,
            end: 7,
            style: { font_family: "Authored B", fill: "#ffd700" },
          },
        ],
      },
    },
    links: {
      sceneA: ["stageA"],
      stageA: ["textA"],
      sceneB: ["stageB"],
      stageB: ["textB"],
    },
    scenes_ref: ["sceneA", "sceneB"],
    animations: {},
  },
};

function descendantsForTest(
  source: typeof multiSceneSnapshot,
  rootId: string
): string[] {
  const result: string[] = [];
  const pending = [rootId];
  const links = source.document.links as Record<string, string[]>;
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || result.includes(id)) continue;
    result.push(id);
    pending.push(...(links[id] ?? []));
  }
  return result;
}

function surface() {
  return {
    loadSceneGrida: vi.fn<(bytes: Uint8Array) => void>(),
    switchScene: vi.fn<(sceneId: string) => void>(),
    loadedSceneIds: vi.fn<() => string[]>(() => ["scene"]),
    drainMissingImages: vi.fn<() => string[]>(() => []),
    resolveImage: vi.fn<(resourceId: string, bytes: Uint8Array) => void>(),
    listMissingFonts: vi.fn<() => Array<{ family: string }>>(() => []),
    addFont: vi.fn<(family: string, bytes: Uint8Array) => void>(),
    setFallbackFonts: vi.fn<(families: string[]) => void>(),
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type PromptOutcome =
  | { status: "resolved" }
  | { status: "rejected"; reason: unknown }
  | { status: "pending" };

async function promptOutcome<T>(promise: Promise<T>): Promise<PromptOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race<PromptOutcome>([
    promise.then<PromptOutcome, PromptOutcome>(
      () => ({ status: "resolved" }),
      (reason: unknown) => ({ status: "rejected", reason })
    ),
    new Promise<PromptOutcome>((resolve) => {
      timer = setTimeout(() => resolve({ status: "pending" }), 0);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  return outcome;
}

async function flushLateSettlement(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("live scene runtime", () => {
  it("rejects a pre-aborted boot without creating a surface", async () => {
    const fake = surface();
    const controller = new AbortController();
    const createSurface = vi.fn<() => Promise<ReturnType<typeof surface>>>(
      async () => fake
    );
    controller.abort();

    const outcome = await promptOutcome(
      createLiveSceneRuntime({
        canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
        archive: { document: new Uint8Array([1]), images: {} },
        snapshot,
        sceneId: "scene",
        expectedSchemaVersion: "test-schema",
        signal: controller.signal,
        createSurface,
        afterPaint: async () => {},
      })
    );

    expect(outcome).toMatchObject({
      status: "rejected",
      reason: { name: "AbortError" },
    });
    expect(createSurface).not.toHaveBeenCalled();
    expect(fake.dispose).not.toHaveBeenCalled();
  });

  it("rejects promptly during surface creation and disposes a late surface exactly once", async () => {
    const fake = surface();
    const controller = new AbortController();
    const pendingSurface = deferred<ReturnType<typeof surface>>();
    let receivedSignal: AbortSignal | undefined;
    const creation = createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      signal: controller.signal,
      createSurface: (signal?: AbortSignal) => {
        receivedSignal = signal;
        return pendingSurface.promise;
      },
      afterPaint: async () => {},
    });

    const observed = promptOutcome(creation);
    controller.abort();
    const outcome = await observed;
    pendingSurface.resolve(fake);
    await flushLateSettlement();

    expect(receivedSignal).toBe(controller.signal);
    expect(outcome).toMatchObject({
      status: "rejected",
      reason: { name: "AbortError" },
    });
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects promptly during image hydration without applying late bytes", async () => {
    const fake = surface();
    fake.drainMissingImages.mockReturnValue(["res://images/late"]);
    const controller = new AbortController();
    const pendingImage = deferred<Uint8Array | null>();
    let receivedSignal: AbortSignal | undefined;
    const resolveImage = vi.fn<
      (resourceId: string, signal?: AbortSignal) => Promise<Uint8Array | null>
    >((_resourceId, signal) => {
      receivedSignal = signal;
      return pendingImage.promise;
    });
    const creation = createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      signal: controller.signal,
      createSurface: async () => fake,
      resolveImage,
      afterPaint: async () => {},
    });
    await vi.waitFor(() => expect(resolveImage).toHaveBeenCalledTimes(1));

    const observed = promptOutcome(creation);
    controller.abort();
    const outcome = await observed;
    pendingImage.resolve(new Uint8Array([7, 8, 9]));
    await flushLateSettlement();

    expect(receivedSignal).toBe(controller.signal);
    expect(outcome).toMatchObject({
      status: "rejected",
      reason: { name: "AbortError" },
    });
    expect(fake.resolveImage).not.toHaveBeenCalled();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects promptly during font hydration without registering late faces", async () => {
    const fake = surface();
    fake.listMissingFonts.mockReturnValue([{ family: "Inter" }]);
    const controller = new AbortController();
    const pendingFont = deferred<Uint8Array | null>();
    let receivedSignal: AbortSignal | undefined;
    const resolveFont = vi.fn<
      (family: string, signal?: AbortSignal) => Promise<Uint8Array | null>
    >((_family, signal) => {
      receivedSignal = signal;
      return pendingFont.promise;
    });
    const creation = createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      signal: controller.signal,
      createSurface: async () => fake,
      resolveFont,
      afterPaint: async () => {},
    });
    await vi.waitFor(() => expect(resolveFont).toHaveBeenCalledTimes(1));

    const observed = promptOutcome(creation);
    controller.abort();
    const outcome = await observed;
    pendingFont.resolve(new Uint8Array([7, 8, 9]));
    await flushLateSettlement();

    expect(receivedSignal).toBe(controller.signal);
    expect(outcome).toMatchObject({
      status: "rejected",
      reason: { name: "AbortError" },
    });
    expect(fake.addFont).not.toHaveBeenCalled();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2])(
    "rejects promptly during paint stabilization pass %s and disposes the surface exactly once",
    async (blockedPaint) => {
      const fake = surface();
      const controller = new AbortController();
      const pendingPaint = deferred<void>();
      let receivedSignal: AbortSignal | undefined;
      let paintCalls = 0;
      const afterPaint = vi.fn<(signal?: AbortSignal) => Promise<void>>(
        (signal) => {
          receivedSignal = signal;
          paintCalls += 1;
          return paintCalls === blockedPaint
            ? pendingPaint.promise
            : Promise.resolve();
        }
      );
      const creation = createLiveSceneRuntime({
        canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
        archive: { document: new Uint8Array([1]), images: {} },
        snapshot,
        sceneId: "scene",
        expectedSchemaVersion: "test-schema",
        signal: controller.signal,
        createSurface: async () => fake,
        afterPaint,
      });
      await vi.waitFor(() =>
        expect(afterPaint).toHaveBeenCalledTimes(blockedPaint)
      );

      const observed = promptOutcome(creation);
      controller.abort();
      const outcome = await observed;
      pendingPaint.resolve();
      await flushLateSettlement();

      expect(receivedSignal).toBe(controller.signal);
      expect(outcome).toMatchObject({
        status: "rejected",
        reason: { name: "AbortError" },
      });
      expect(fake.dispose).toHaveBeenCalledTimes(1);
    }
  );

  it("transfers surface ownership after boot instead of binding runtime lifetime to the signal", async () => {
    const fake = surface();
    const controller = new AbortController();
    const afterPaint = vi.fn<(signal?: AbortSignal) => Promise<void>>(
      async (signal) => {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      }
    );
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      signal: controller.signal,
      createSurface: async () => fake,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint,
    });

    controller.abort();
    await flushLateSettlement();
    expect(fake.dispose).not.toHaveBeenCalled();
    await runtime.applyPatch({ text: { body: "Owned after boot" } });
    expect(fake.replaceNode).toHaveBeenCalledTimes(1);

    runtime.dispose();
    runtime.dispose();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it("unregisters a default-created WebGL context only after the final stop frame", async () => {
    const fake = surface();
    const animationFrames: FrameRequestCallback[] = [];
    const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>(
      (callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      }
    );
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    const gl = {
      currentContext: { handle: 41 },
      makeContextCurrent: vi.fn<(handle: number) => void>(),
      deleteContext: vi.fn<(handle: number) => void>(),
    };
    canvasWasmMocks.init.mockResolvedValueOnce({
      module: { GL: gl },
      createWebGLCanvasSurface: vi.fn<() => ReturnType<typeof surface>>(
        () => fake
      ),
    });
    const canvas = {
      width: 1920,
      height: 1080,
      dispatchEvent: vi.fn<(event: Event) => boolean>(),
    } as unknown as HTMLCanvasElement;
    const runtime = await createLiveSceneRuntime({
      canvas,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      afterPaint: async () => {},
    });

    runtime.dispose();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(gl.deleteContext).not.toHaveBeenCalled();

    animationFrames.shift()?.(0);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(gl.deleteContext).not.toHaveBeenCalled();

    animationFrames.shift()?.(16);
    expect(gl.makeContextCurrent).toHaveBeenCalledWith(0);
    expect(gl.deleteContext).toHaveBeenCalledTimes(1);
    expect(gl.deleteContext).toHaveBeenCalledWith(41);
    expect(canvas.dispatchEvent).not.toHaveBeenCalled();
  });

  it("still releases a default WebGL context when surface disposal throws", async () => {
    const fake = surface();
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const gl = {
      currentContext: { handle: 42 },
      makeContextCurrent: vi.fn<(handle: number) => void>(),
      deleteContext: vi.fn<(handle: number) => void>(),
    };
    canvasWasmMocks.init.mockResolvedValueOnce({
      module: { GL: gl },
      createWebGLCanvasSurface: vi.fn<() => ReturnType<typeof surface>>(
        () => fake
      ),
    });
    const runtime = await createLiveSceneRuntime({
      canvas: {
        width: 1920,
        height: 1080,
      } as unknown as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      afterPaint: async () => {},
    });
    fake.dispose.mockImplementationOnce(() => {
      throw new Error("surface disposal failed");
    });

    expect(() => runtime.dispose()).toThrow("surface disposal failed");
    animationFrames.shift()?.(0);
    animationFrames.shift()?.(16);
    expect(gl.deleteContext).toHaveBeenCalledWith(42);
  });

  it("leaves custom surface disposal ownership unchanged", async () => {
    const fake = surface();
    const requestFrame = vi.fn<FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      afterPaint: async () => {},
    });

    runtime.dispose();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it("reprojects the already-active scene from canonical nodes without switching it again", async () => {
    const fake = surface();
    const canonicalNodes = snapshot.document.nodes as Record<
      string,
      Record<string, unknown>
    >;
    let activeNodes: Record<string, Record<string, unknown>> = {};
    fake.switchScene.mockImplementation(() => {
      activeNodes = Object.fromEntries(
        ["scene", "stage", "body", "auto"].map((id) => [
          id,
          { ...canonicalNodes[id] },
        ])
      );
    });
    fake.replaceNode.mockImplementation((bytes) => {
      const node = JSON.parse(new TextDecoder().decode(bytes)) as {
        id: string;
      };
      if (!Object.prototype.hasOwnProperty.call(activeNodes, node.id)) {
        return false;
      }
      activeNodes[node.id] = node;
      return true;
    });
    const afterPaint = vi.fn<() => Promise<void>>(async () => {});
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint,
    });

    await runtime.applyPatch({
      text: {
        body: "Prior body",
        auto: "Prior auto",
      },
    });
    const redrawsBeforeCue = fake.redraw.mock.calls.length;
    const paintsBeforeCue = afterPaint.mock.calls.length;
    const replacementsBeforeCue = fake.replaceNode.mock.calls.length;

    await runtime.activateScene("scene", {
      text: { body: "Requested body" },
    });

    expect(fake.switchScene.mock.calls).toEqual([["scene"]]);
    expect(activeNodes.body).toMatchObject({ text: "Requested body" });
    expect(activeNodes.auto).toMatchObject({ text: "Auto authored" });
    expect(fake.redraw).toHaveBeenCalledTimes(redrawsBeforeCue + 1);
    expect(afterPaint).toHaveBeenCalledTimes(paintsBeforeCue + 1);
    const cueReplacementOrders =
      fake.replaceNode.mock.invocationCallOrder.slice(replacementsBeforeCue);
    const cueRedrawOrder = fake.redraw.mock.invocationCallOrder.at(-1)!;
    const cuePaintOrder = afterPaint.mock.invocationCallOrder.at(-1)!;
    expect(cueReplacementOrders).toHaveLength(2);
    expect(cueReplacementOrders.every((order) => order < cueRedrawOrder)).toBe(
      true
    );
    expect(cueRedrawOrder).toBeLessThan(cuePaintOrder);
  });

  it("projects a transparent scene root in the archive before the engine paints", async () => {
    const fake = surface();
    const schemaVersion = grida.program.document.SCHEMA_VERSION;
    const source = {
      version: schemaVersion,
      document: {
        nodes: {
          scene: {
            id: "scene",
            type: "scene",
            name: "Scene",
            active: true,
            locked: false,
            guides: [],
            edges: [],
            constraints: { children: "multiple" },
            background_color: { r: 0, g: 0, b: 0, a: 1 },
          },
          stage: {
            id: "stage",
            type: "container",
            name: "Stage",
            active: true,
            locked: false,
            clips_content: true,
            opacity: 1,
            z_index: 0,
            rotation: 0,
            layout_positioning: "absolute",
            layout_inset_left: 0,
            layout_inset_top: 0,
            layout_target_width: 1920,
            layout_target_height: 1080,
            layout_mode: "flow",
            layout_direction: "horizontal",
            layout_main_axis_alignment: "start",
            layout_cross_axis_alignment: "start",
            layout_main_axis_gap: 0,
            layout_cross_axis_gap: 0,
            layout_padding_top: 0,
            layout_padding_right: 0,
            layout_padding_bottom: 0,
            layout_padding_left: 0,
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
            fill: {
              type: "solid",
              color: { r: 0, g: 0, b: 0, a: 1 },
              active: true,
            },
            fill_paints: [
              {
                type: "solid",
                color: { r: 0, g: 0, b: 0, a: 1 },
                active: true,
              },
            ],
          },
        },
        links: { scene: ["stage"], stage: [] },
        scenes_ref: ["scene"],
        entry_scene_id: "scene",
        images: {},
        bitmaps: {},
        properties: {},
        external_assets: {},
        animations: {},
        minimum_reader_version: schemaVersion,
      },
    };
    const authoredDocument = io.GRID.encode(
      source.document as never,
      schemaVersion
    );
    await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: authoredDocument, images: {} },
      snapshot: source,
      sceneId: "scene",
      expectedSchemaVersion: schemaVersion,
      transparentSceneBackground: true,
      createSurface: async () => fake,
      afterPaint: async () => {},
    });

    const loadedDocument = io.GRID.decode(
      fake.loadSceneGrida.mock.calls[0]![0]
    ) as unknown as typeof source.document;
    expect(loadedDocument.nodes.scene).not.toHaveProperty("background_color");
    expect(loadedDocument.nodes.stage).not.toHaveProperty("fill");
    expect(loadedDocument.nodes.stage).not.toHaveProperty("fill_paints");
    expect(source.document.nodes.scene).toHaveProperty("background_color");
    const authoredRoundTrip = io.GRID.decode(
      authoredDocument
    ) as unknown as typeof source.document;
    expect(authoredRoundTrip.nodes.scene).toHaveProperty("background_color", {
      r: 0,
      g: 0,
      b: 0,
      a: 1,
    });
  });

  it("restores the prior same-scene projection when presentation fails", async () => {
    const fake = surface();
    const canonicalNodes = snapshot.document.nodes as Record<
      string,
      Record<string, unknown>
    >;
    let activeNodes: Record<string, Record<string, unknown>> = {};
    fake.switchScene.mockImplementation(() => {
      activeNodes = Object.fromEntries(
        ["scene", "stage", "body", "auto"].map((id) => [
          id,
          { ...canonicalNodes[id] },
        ])
      );
    });
    fake.replaceNode.mockImplementation((bytes) => {
      const node = JSON.parse(new TextDecoder().decode(bytes)) as {
        id: string;
      };
      if (!Object.prototype.hasOwnProperty.call(activeNodes, node.id)) {
        return false;
      }
      activeNodes[node.id] = node;
      return true;
    });
    const rollbackPaint = deferred<void>();
    let presentationPhase: "normal" | "reject-target" | "block-rollback" =
      "normal";
    const afterPaint = vi.fn<() => Promise<void>>(() => {
      if (presentationPhase === "reject-target") {
        presentationPhase = "block-rollback";
        return Promise.reject(new Error("presentation failed"));
      }
      if (presentationPhase === "block-rollback") {
        presentationPhase = "normal";
        return rollbackPaint.promise;
      }
      return Promise.resolve();
    });
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint,
    });
    await runtime.applyPatch({
      text: {
        body: "Prior body",
        auto: "Prior auto",
      },
    });

    const paintsBeforeActivation = afterPaint.mock.calls.length;
    presentationPhase = "reject-target";
    const rejectedActivation = runtime.activateScene("scene", {
      text: { body: "Rejected body" },
    });
    await vi.waitFor(() =>
      expect(afterPaint).toHaveBeenCalledTimes(paintsBeforeActivation + 2)
    );
    const followUp = runtime.applyPatch({
      text: { body: "Recovered body" },
    });

    expect(fake.switchScene.mock.calls).toEqual([["scene"]]);
    expect(activeNodes.body).toMatchObject({ text: "Prior body" });
    expect(activeNodes.auto).toMatchObject({ text: "Prior auto" });
    expect(await promptOutcome(rejectedActivation)).toMatchObject({
      status: "pending",
    });
    expect(await promptOutcome(followUp)).toMatchObject({ status: "pending" });
    expect(afterPaint).toHaveBeenCalledTimes(paintsBeforeActivation + 2);

    rollbackPaint.resolve();
    await expect(rejectedActivation).rejects.toThrow("presentation failed");
    await followUp;
    expect(activeNodes.body).toMatchObject({ text: "Recovered body" });
    expect(afterPaint).toHaveBeenCalledTimes(paintsBeforeActivation + 3);
    expect(fake.dispose).not.toHaveBeenCalled();
  });

  it("poisons the runtime when a failed same-scene presentation cannot restore its prior projection", async () => {
    const fake = surface();
    const canonicalNodes = snapshot.document.nodes as Record<
      string,
      Record<string, unknown>
    >;
    let activeNodes: Record<string, Record<string, unknown>> = {};
    fake.switchScene.mockImplementation(() => {
      activeNodes = Object.fromEntries(
        ["scene", "stage", "body", "auto"].map((id) => [
          id,
          { ...canonicalNodes[id] },
        ])
      );
    });
    fake.replaceNode.mockImplementation((bytes) => {
      const node = JSON.parse(new TextDecoder().decode(bytes)) as {
        id: string;
      };
      if (!Object.prototype.hasOwnProperty.call(activeNodes, node.id)) {
        return false;
      }
      activeNodes[node.id] = node;
      return true;
    });
    let presentationFailures = 0;
    const afterPaint = vi.fn<() => Promise<void>>(async () => {
      if (presentationFailures === 0) return;
      presentationFailures -= 1;
      throw new Error("presentation failed");
    });
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint,
    });
    await runtime.applyPatch({ text: { body: "Prior body" } });

    presentationFailures = 2;
    await expect(
      runtime.activateScene("scene", {
        text: { body: "Rejected body" },
      })
    ).rejects.toMatchObject({ code: "activation-rollback-failed" });

    expect(fake.switchScene.mock.calls).toEqual([["scene"]]);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    await expect(runtime.activateScene("scene")).rejects.toMatchObject({
      code: "runtime-disposed",
    });
  });

  it("atomically activates A-B-A from canonical nodes on one loaded surface", async () => {
    const fake = surface();
    fake.loadedSceneIds.mockReturnValue(["sceneA", "sceneB"]);
    let activeSceneId = "";
    let activeNodes: Record<string, Record<string, unknown>> = {};
    const canonicalNodes = multiSceneSnapshot.document.nodes as Record<
      string,
      Record<string, unknown>
    >;
    fake.switchScene.mockImplementation((sceneId) => {
      activeSceneId = sceneId;
      activeNodes = Object.fromEntries(
        descendantsForTest(multiSceneSnapshot, sceneId).map((id) => [
          id,
          { ...canonicalNodes[id] },
        ])
      );
    });
    fake.replaceNode.mockImplementation((bytes) => {
      const node = JSON.parse(new TextDecoder().decode(bytes)) as {
        id: string;
      };
      if (!Object.prototype.hasOwnProperty.call(activeNodes, node.id)) {
        return false;
      }
      activeNodes[node.id] = node;
      return true;
    });
    const afterPaint = vi.fn<() => Promise<void>>(async () => {});
    const encoded: Array<Record<string, unknown>> = [];
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: multiSceneSnapshot,
      sceneId: "sceneA",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      resolveFont: async () => new Uint8Array([1]),
      encodeNode: (node) => {
        encoded.push({ ...node });
        return new TextEncoder().encode(JSON.stringify(node));
      },
      afterPaint,
    });

    await runtime.applyPatch({ text: { textA: "Transient scene A" } });
    const redrawsBeforeB = fake.redraw.mock.calls.length;
    await runtime.activateScene("sceneB", {
      text: { textB: "Transient scene B" },
    });
    expect(fake.redraw).toHaveBeenCalledTimes(redrawsBeforeB + 1);
    const redrawsBeforeA = fake.redraw.mock.calls.length;
    await runtime.activateScene("sceneA");
    expect(fake.redraw).toHaveBeenCalledTimes(redrawsBeforeA + 1);

    expect(fake.loadSceneGrida).toHaveBeenCalledTimes(1);
    expect(fake.switchScene.mock.calls).toEqual([
      ["sceneA"],
      ["sceneB"],
      ["sceneA"],
    ]);
    expect(activeSceneId).toBe("sceneA");
    expect(activeNodes.textA).toMatchObject({ text: "Scene A" });
    expect(afterPaint).toHaveBeenCalledTimes(5);
    expect(encoded.filter((node) => node.id === "textB").at(-1)).toMatchObject({
      id: "textB",
      text: "Transient scene B",
      styled_runs: [
        {
          start: 0,
          end: "Transient scene B".length,
          style: { font_family: "Authored B", fill: "#ffd700" },
        },
      ],
    });
    expect(fake.switchScene.mock.invocationCallOrder[1]).toBeLessThan(
      fake.replaceNode.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY
    );
  });

  it("restores the prior active scene and its overrides when activation fails", async () => {
    const fake = surface();
    fake.loadedSceneIds.mockReturnValue(["sceneA", "sceneB"]);
    let activeSceneId = "";
    const activeText = new Map<string, string>();
    fake.switchScene.mockImplementation((sceneId) => {
      activeSceneId = sceneId;
      activeText.clear();
      activeText.set(
        sceneId === "sceneA" ? "textA" : "textB",
        sceneId === "sceneA" ? "Scene A" : "Scene B"
      );
    });
    fake.replaceNode.mockImplementation((bytes) => {
      const node = JSON.parse(new TextDecoder().decode(bytes)) as {
        id: string;
        text?: string;
      };
      if (
        activeSceneId === "sceneB" &&
        node.id === "textB" &&
        node.text === "Rejected B"
      )
        return false;
      if (!activeText.has(node.id)) return false;
      activeText.set(node.id, node.text ?? "");
      return true;
    });
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: multiSceneSnapshot,
      sceneId: "sceneA",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      resolveFont: async () => new Uint8Array([1]),
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint: async () => {},
    });

    await runtime.applyPatch({ text: { textA: "Prior live A" } });
    await expect(
      runtime.activateScene("sceneB", { text: { textB: "Rejected B" } })
    ).rejects.toMatchObject({ code: "patch-rejected" });

    expect(fake.switchScene.mock.calls).toEqual([
      ["sceneA"],
      ["sceneB"],
      ["sceneA"],
    ]);
    expect(activeSceneId).toBe("sceneA");
    expect(activeText.get("textA")).toBe("Prior live A");
  });

  it("poisons the runtime when prior-scene activation rollback fails", async () => {
    const fake = surface();
    fake.loadedSceneIds.mockReturnValue(["sceneA", "sceneB"]);
    fake.switchScene.mockImplementation((sceneId) => {
      if (sceneId === "sceneA" && fake.switchScene.mock.calls.length > 1) {
        throw new Error("previous scene restore failed");
      }
    });
    fake.replaceNode.mockImplementation((bytes) => {
      const node = JSON.parse(new TextDecoder().decode(bytes)) as {
        text?: string;
      };
      return node.text !== "Rejected B";
    });
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: multiSceneSnapshot,
      sceneId: "sceneA",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      resolveFont: async () => new Uint8Array([1]),
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint: async () => {},
    });

    await expect(
      runtime.activateScene("sceneB", { text: { textB: "Rejected B" } })
    ).rejects.toMatchObject({ code: "activation-rollback-failed" });
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    await expect(runtime.activateScene("sceneA")).rejects.toMatchObject({
      code: "runtime-disposed",
    });
  });

  it("preserves authored rich runs when a text projection is a no-op", async () => {
    const fake = surface();
    fake.loadedSceneIds.mockReturnValue(["sceneA", "sceneB"]);
    const encoded: Array<Record<string, unknown>> = [];
    const richRuns = [
      { start: 0, end: 3, style: { font_family: "Authored A", fill: "#fff" } },
      { start: 3, end: 7, style: { font_family: "Authored A", fill: "#f00" } },
    ];
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: {
        ...multiSceneSnapshot,
        document: {
          ...multiSceneSnapshot.document,
          nodes: {
            ...multiSceneSnapshot.document.nodes,
            textA: {
              ...multiSceneSnapshot.document.nodes.textA,
              styled_runs: richRuns,
            },
          },
        },
      },
      sceneId: "sceneA",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      resolveFont: async () => new Uint8Array([1]),
      encodeNode: (node) => {
        encoded.push({ ...node });
        return new TextEncoder().encode(JSON.stringify(node));
      },
      afterPaint: async () => {},
    });

    await runtime.applyPatch({ text: { textA: "Scene A" } });
    expect(encoded.filter((node) => node.id === "textA").at(-1)).toMatchObject({
      styled_runs: richRuns,
    });
  });

  it("rolls back every attempted node when the engine throws mid-patch", async () => {
    const fake = surface();
    const activeText = new Map([
      ["body", "Authored"],
      ["auto", "Auto authored"],
    ]);
    fake.replaceNode.mockImplementation((bytes) => {
      const node = JSON.parse(new TextDecoder().decode(bytes)) as {
        id: string;
        text?: string;
      };
      if (node.id === "body" && node.text === "New body") {
        throw new Error("engine replacement threw");
      }
      activeText.set(node.id, node.text ?? "");
      return true;
    });
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint: async () => {},
    });

    await expect(
      runtime.applyPatch({
        text: { body: "New body", auto: "New auto" },
      })
    ).rejects.toMatchObject({ code: "patch-rejected" });
    expect(Object.fromEntries(activeText)).toEqual({
      body: "Authored",
      auto: "Auto authored",
    });
    expect(fake.dispose).not.toHaveBeenCalled();
  });

  it("poisons a surface when rollback cannot be proven", async () => {
    const fake = surface();
    fake.replaceNode.mockReturnValue(false);
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
      afterPaint: async () => {},
    });

    await expect(
      runtime.applyPatch({ text: { body: "Untrusted" } })
    ).rejects.toMatchObject({ code: "patch-rollback-failed" });
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    runtime.dispose();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });

  it("serializes activation with patches and updates active-scene bounds", async () => {
    const fake = surface();
    fake.loadedSceneIds.mockReturnValue(["sceneA", "sceneB"]);
    const encoded: Array<Record<string, unknown>> = [];
    const runtime = await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: multiSceneSnapshot,
      sceneId: "sceneA",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      resolveFont: async () => new Uint8Array([1]),
      encodeNode: (node) => {
        encoded.push({ ...node });
        return new TextEncoder().encode(JSON.stringify(node));
      },
      afterPaint: async () => {},
    });

    await expect(
      runtime.activateScene("sceneB", {
        text: { textA: "Wrong target scene" },
      })
    ).rejects.toMatchObject({ code: "patch-node-outside-scene" });
    expect(fake.switchScene).toHaveBeenCalledTimes(1);
    expect(fake.replaceNode).not.toHaveBeenCalled();

    const activation = runtime.activateScene("sceneB");
    const queuedPatch = runtime.applyPatch({
      text: { textB: "Active scene B" },
    });
    await Promise.all([activation, queuedPatch]);
    await expect(
      runtime.applyPatch({ text: { textA: "Wrong active scene" } })
    ).rejects.toMatchObject({ code: "patch-node-outside-scene" });

    expect(encoded).toContainEqual(
      expect.objectContaining({ id: "textB", text: "Active scene B" })
    );
    expect(fake.replaceNode).toHaveBeenCalledTimes(1);
  });

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
    expect(fake.replaceNode).toHaveBeenCalledTimes(4);
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

  it("hydrates document-declared fonts and applies one shared fallback policy", async () => {
    const fake = surface();
    const requested: string[] = [];
    await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: {
        ...snapshot,
        document: {
          ...snapshot.document,
          nodes: {
            ...snapshot.document.nodes,
            body: {
              ...snapshot.document.nodes.body,
              default_style: {
                font_family: "Berlin Sans FBDemi",
                font_size: 108,
              },
            },
          },
        },
      },
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      fallbackFonts: ["Times New Roman", "Inter"],
      resolveFont: async (family) => {
        requested.push(family);
        return family === "Times New Roman" ? new Uint8Array([7, 8]) : null;
      },
      afterPaint: async () => {},
    });

    expect(requested).toContain("Berlin Sans FBDemi");
    expect(fake.listMissingFonts).toHaveBeenCalled();
    expect(fake.addFont).toHaveBeenCalledWith(
      "Times New Roman",
      new Uint8Array([7, 8])
    );
    expect(fake.setFallbackFonts).toHaveBeenCalledWith([
      "Times New Roman",
      "Inter",
    ]);
  });

  it("hydrates declared fonts for every scene before persistent activation", async () => {
    const fake = surface();
    fake.loadedSceneIds.mockReturnValue(["sceneA", "sceneB"]);
    const requested: string[] = [];
    await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: {
        ...multiSceneSnapshot,
        document: {
          ...multiSceneSnapshot.document,
          nodes: {
            ...multiSceneSnapshot.document.nodes,
            textB: {
              ...multiSceneSnapshot.document.nodes.textB,
              default_style: { font_family: "Scene B Font", font_size: 72 },
            },
          },
        },
      },
      sceneId: "sceneA",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      resolveFont: async (family) => {
        requested.push(family);
        return new Uint8Array([4, 2]);
      },
      afterPaint: async () => {},
    });

    expect(requested).toContain("Scene B Font");
    expect(fake.addFont).toHaveBeenCalledWith(
      "Scene B Font",
      new Uint8Array([4, 2])
    );
    const fontCall = fake.addFont.mock.calls.findIndex(
      ([family]) => family === "Scene B Font"
    );
    expect(
      fake.addFont.mock.invocationCallOrder[fontCall] ??
        Number.POSITIVE_INFINITY
    ).toBeLessThan(
      fake.switchScene.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it("hydrates external images for every scene before persistent activation", async () => {
    const fake = surface();
    fake.loadedSceneIds.mockReturnValue(["sceneA", "sceneB"]);
    const resourceId = `res://images/${"a".repeat(64)}`;
    const bytes = new Uint8Array([9, 8, 7]);
    const resolveImage = vi.fn<
      (resourceId: string, signal?: AbortSignal) => Promise<Uint8Array>
    >(async () => bytes);
    await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: new Uint8Array([1]), images: {} },
      snapshot: {
        ...multiSceneSnapshot,
        document: {
          ...multiSceneSnapshot.document,
          nodes: {
            ...multiSceneSnapshot.document.nodes,
            stageB: {
              ...multiSceneSnapshot.document.nodes.stageB,
              fill_paints: [{ type: "image", src: resourceId }],
            },
          },
        },
      },
      sceneId: "sceneA",
      expectedSchemaVersion: "test-schema",
      createSurface: async () => fake,
      resolveImage,
      resolveFont: async () => new Uint8Array([1]),
      afterPaint: async () => {},
    });

    expect(resolveImage).toHaveBeenCalledWith(resourceId, undefined);
    expect(fake.resolveImage).toHaveBeenCalledWith(resourceId, bytes);
    expect(
      fake.resolveImage.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    ).toBeLessThan(
      fake.switchScene.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it("rasterizes canonical tile scenes through the shared Grida document path", async () => {
    const raster = {
      loadSceneGrida: vi.fn<(bytes: Uint8Array) => void>(),
      switchScene: vi.fn<(sceneId: string) => void>(),
      loadedSceneIds: vi.fn<() => string[]>(() => ["scene"]),
      addImageWithId: vi.fn<(bytes: Uint8Array, resourceId: string) => void>(),
      addFont: vi.fn<(family: string, bytes: Uint8Array) => void>(),
      setFallbackFonts: vi.fn<(families: string[]) => void>(),
      replaceNode: vi.fn<(bytes: Uint8Array) => boolean>(() => true),
      exportNodeAs: vi.fn<
        (
          nodeId: string,
          options: {
            format: "PNG";
            constraints: { type: "scale-to-fit-width"; value: number };
          }
        ) => { data: Uint8Array }
      >(() => ({ data: new Uint8Array([137, 80, 78, 71]) })),
      dispose: vi.fn<() => void>(),
    };
    const renderer = await createLiveSceneThumbnailRenderer({
      createSurface: async () => raster,
    });

    const bytes = await renderer.render({
      archive: { document: new Uint8Array([1, 2, 3]), images: {} },
      snapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      width: 320,
      fallbackFonts: ["Inter"],
    });

    expect(raster.loadSceneGrida).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3])
    );
    expect(raster.switchScene).toHaveBeenCalledWith("scene");
    expect(raster.exportNodeAs).toHaveBeenCalledWith("stage", {
      format: "PNG",
      constraints: { type: "scale-to-fit-width", value: 320 },
    });
    expect(bytes).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it("applies the requested live text and visibility projection before exporting a thumbnail", async () => {
    const thumbnailSnapshot = structuredClone(snapshot);
    Object.assign(thumbnailSnapshot.document.nodes.body, {
      default_style: { font_family: "Authored Body", fill: "#ffd700" },
      styled_runs: [
        {
          start: 0,
          end: 8,
          style: { font_family: "Authored Body", fill: "#ffd700" },
        },
      ],
    });
    const replaced: Array<Record<string, unknown>> = [];
    const raster = {
      loadSceneGrida: vi.fn<(bytes: Uint8Array) => void>(),
      switchScene: vi.fn<(sceneId: string) => void>(),
      loadedSceneIds: vi.fn<() => string[]>(() => ["scene"]),
      addImageWithId: vi.fn<(bytes: Uint8Array, resourceId: string) => void>(),
      addFont: vi.fn<(family: string, bytes: Uint8Array) => void>(),
      setFallbackFonts: vi.fn<(families: string[]) => void>(),
      replaceNode: vi.fn<(bytes: Uint8Array) => boolean>((bytes) => {
        replaced.push(
          JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
        );
        return true;
      }),
      exportNodeAs: vi.fn<
        (
          nodeId: string,
          options: {
            format: "PNG";
            constraints: { type: "scale-to-fit-width"; value: number };
          }
        ) => { data: Uint8Array }
      >(() => ({ data: new Uint8Array([137, 80, 78, 71]) })),
      dispose: vi.fn<() => void>(),
    };
    const renderer = await createLiveSceneThumbnailRenderer({
      createSurface: async () => raster,
      encodeNode: (node) => new TextEncoder().encode(JSON.stringify(node)),
    });

    await renderer.render({
      archive: { document: new Uint8Array([1, 2, 3]), images: {} },
      snapshot: thumbnailSnapshot,
      sceneId: "scene",
      expectedSchemaVersion: "test-schema",
      width: 320,
      fallbackFonts: ["Inter"],
      patch: {
        text: { body: "PRAYER 1" },
        textStyles: { body: { fontSize: 42 } },
        visibility: { auto: false },
      },
    });

    expect(raster.switchScene).toHaveBeenCalledWith("scene");
    expect(replaced).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "body",
          text: "PRAYER 1",
          default_style: {
            font_family: "Authored Body",
            fill: "#ffd700",
            font_size: 42,
          },
          styled_runs: [
            {
              start: 0,
              end: 8,
              style: {
                font_family: "Authored Body",
                fill: "#ffd700",
                font_size: 42,
              },
            },
          ],
        }),
        expect.objectContaining({ id: "auto", active: false }),
      ])
    );
    expect(raster.exportNodeAs).toHaveBeenCalledTimes(1);
  });

  it("projects EVERY scene root when external media owns the presentation", async () => {
    const fake = surface();
    const schemaVersion = grida.program.document.SCHEMA_VERSION;
    const sceneNode = (id: string) => ({
      id,
      type: "scene",
      name: id,
      active: true,
      locked: false,
      guides: [],
      edges: [],
      constraints: { children: "multiple" },
      background_color: { r: 0, g: 0, b: 0, a: 1 },
    });
    const stageNode = (id: string) => ({
      id,
      type: "container",
      name: id,
      active: true,
      locked: false,
      clips_content: true,
      opacity: 1,
      z_index: 0,
      rotation: 0,
      layout_positioning: "absolute",
      layout_inset_left: 0,
      layout_inset_top: 0,
      layout_target_width: 1920,
      layout_target_height: 1080,
      layout_mode: "flow",
      layout_direction: "horizontal",
      layout_main_axis_alignment: "start",
      layout_cross_axis_alignment: "start",
      layout_main_axis_gap: 0,
      layout_cross_axis_gap: 0,
      layout_padding_top: 0,
      layout_padding_right: 0,
      layout_padding_bottom: 0,
      layout_padding_left: 0,
      stroke_width: 0,
      stroke_cap: "butt",
      stroke_join: "miter",
      fill: {
        type: "solid",
        color: { r: 0, g: 0, b: 0, a: 1 },
        active: true,
      },
      fill_paints: [
        {
          type: "solid",
          color: { r: 0, g: 0, b: 0, a: 1 },
          active: true,
        },
      ],
    });
    const source = {
      version: schemaVersion,
      document: {
        nodes: {
          scene: sceneNode("scene"),
          stage: stageNode("stage"),
          "scene-b": sceneNode("scene-b"),
          "stage-b": stageNode("stage-b"),
        },
        links: {
          scene: ["stage"],
          stage: [],
          "scene-b": ["stage-b"],
          "stage-b": [],
        },
        scenes_ref: ["scene", "scene-b"],
        entry_scene_id: "scene",
        images: {},
        bitmaps: {},
        properties: {},
        external_assets: {},
        animations: {},
        minimum_reader_version: schemaVersion,
      },
    };
    const authoredDocument = io.GRID.encode(
      source.document as never,
      schemaVersion
    );
    await createLiveSceneRuntime({
      canvas: { width: 1920, height: 1080 } as HTMLCanvasElement,
      archive: { document: authoredDocument, images: {} },
      snapshot: source,
      sceneId: "scene",
      expectedSchemaVersion: schemaVersion,
      transparentSceneBackground: true,
      createSurface: async () => fake,
      afterPaint: async () => {},
    });

    const loadedDocument = io.GRID.decode(
      fake.loadSceneGrida.mock.calls[0]![0]
    ) as unknown as typeof source.document;
    // The presentation runtime is media-owned as a whole: activating ANY
    // scene (a slide advance) must reveal the external media, so every
    // scene root and its stage fill project transparent up front.
    expect(loadedDocument.nodes["scene-b"]).not.toHaveProperty(
      "background_color"
    );
    expect(loadedDocument.nodes["stage-b"]).not.toHaveProperty("fill");
    expect(loadedDocument.nodes["stage-b"]).not.toHaveProperty("fill_paints");
    expect(loadedDocument.nodes.scene).not.toHaveProperty("background_color");
  });

  it("projects archives whose attributed text omits optional style records", async () => {
    const schemaVersion = grida.program.document.SCHEMA_VERSION;
    const source = {
      nodes: {
        scene: {
          id: "scene",
          type: "scene",
          name: "Scene",
          active: true,
          locked: false,
          guides: [],
          edges: [],
          constraints: { children: "multiple" },
          background_color: { r: 0, g: 0, b: 0, a: 1 },
        },
        verse: {
          id: "verse",
          type: "text",
          name: "Verse",
          active: true,
          locked: false,
          text: "For God so loved the world",
          // No default_style and no styled_runs: exactly what a decoded
          // authored archive can yield when the writer omitted the optional
          // style tables. The projection re-encode must survive it.
        },
      },
      links: { scene: ["verse"], verse: [] },
      scenes_ref: ["scene"],
      entry_scene_id: "scene",
      images: {},
      bitmaps: {},
      properties: {},
      external_assets: {},
      animations: {},
      minimum_reader_version: schemaVersion,
    };
    const authored = io.GRID.encode(source as never, schemaVersion);
    const projected = projectLiveSceneArchiveBackground(
      authored,
      "scene",
      true,
      schemaVersion
    );
    const decoded = io.GRID.decode(projected) as unknown as typeof source;
    expect(decoded.nodes.scene).not.toHaveProperty("background_color");
    expect((decoded.nodes.verse as { text?: unknown }).text).toContain(
      "For God"
    );
  });
});
