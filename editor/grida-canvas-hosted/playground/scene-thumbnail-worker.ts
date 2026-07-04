/// <reference lib="webworker" />
/**
 * Scene-thumbnail render worker.
 *
 * Owns a HEADLESS raster-backend WASM instance and renders scene thumbnails
 * off the editor's main thread — the "background renderer" model desktop
 * design tools use. The isolation is the point: a slow or HUNG wasm render
 * (the 2026-07-04 effects freeze) costs at most this worker, which the
 * client watchdog terminates and respawns; the editor never blocks.
 *
 * Protocol (client: scene-thumbnail-renderer.ts):
 * - in : { type: "capture", id, docBytes, sceneId, exportNodeId, width,
 *          images: [{ rid, bytes }], fonts: [{ family, urls }],
 *          fallbackFonts: string[] }
 *   Images/fonts are INCREMENTAL: the client tracks what this worker
 *   instance has already received and sends only the delta (registrations
 *   survive `loadSceneGrida` — the wasm image repository is not cleared by
 *   scene loads).
 * - out: { type: "thumbnail", id, bytes }   (transferred)
 *        { type: "error", id, message }
 */

import { createCanvas, type Canvas } from "@grida/canvas-wasm";
import locateFile from "@/grida-canvas/backends/wasm-locate-file";

// Relay worker-side console noise (incl. the wasm runtime's stderr, which
// emscripten routes through console.error) to the client — a hung or failed
// render must be diagnosable from the page.
for (const level of ["error", "warn"] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    try {
      self.postMessage({
        type: "console",
        level,
        text: args
          .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
          .join(" ")
          .slice(0, 400),
      });
    } catch {
      /* non-serializable args — the local log below still happens */
    }
    orig(...args);
  };
}

interface CaptureMessage {
  type: "capture";
  id: number;
  docBytes: ArrayBuffer;
  sceneId: string;
  exportNodeId: string;
  width: number;
  images: Array<{ rid: string; bytes: ArrayBuffer }>;
  fonts: Array<{ family: string; urls: string[] }>;
  fallbackFonts: string[];
}

let canvasPromise: Promise<Canvas> | null = null;
let fallbackFontsSet = false;
const registeredImages = new Set<string>();
const registeredFonts = new Set<string>();

function getCanvas(): Promise<Canvas> {
  canvasPromise ??= createCanvas({
    backend: "raster",
    // The surface size is irrelevant for node exports (exportNodeAs renders
    // to its own raster surface sized by the constraints).
    width: 16,
    height: 16,
    locateFile,
    useEmbeddedFonts: true,
  });
  return canvasPromise;
}

async function registerFonts(
  canvas: Canvas,
  fonts: CaptureMessage["fonts"]
): Promise<void> {
  for (const font of fonts) {
    if (registeredFonts.has(font.family)) continue;
    // Mark before fetching: a partially-failed family should not refetch
    // every capture (same session; a worker restart retries naturally).
    registeredFonts.add(font.family);
    const results = await Promise.allSettled(
      font.urls.map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`font fetch ${res.status}`);
        return res.arrayBuffer();
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        canvas.addFont(font.family, new Uint8Array(r.value));
      }
    }
  }
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as CaptureMessage | null;
  if (!msg || msg.type !== "capture") return;
  void (async () => {
    try {
      const canvas = await getCanvas();
      for (const img of msg.images) {
        if (registeredImages.has(img.rid)) continue;
        canvas.addImageWithId(new Uint8Array(img.bytes), img.rid);
        registeredImages.add(img.rid);
      }
      await registerFonts(canvas, msg.fonts);
      if (!fallbackFontsSet && msg.fallbackFonts.length > 0) {
        canvas.setFallbackFonts(msg.fallbackFonts);
        fallbackFontsSet = true;
      }
      canvas.loadSceneGrida(new Uint8Array(msg.docBytes));
      // `loadSceneGrida` has no error surface (a decode failure is silent) —
      // verify the scene actually decoded before exporting so failures are
      // attributable.
      const sceneIds = canvas.loadedSceneIds();
      if (!sceneIds.includes(msg.sceneId)) {
        throw new Error(
          `scene "${msg.sceneId}" did not decode (loaded: ${JSON.stringify(sceneIds)})`
        );
      }
      canvas.switchScene(msg.sceneId);
      const { data } = canvas.exportNodeAs(msg.exportNodeId, {
        format: "PNG",
        constraints: { type: "scale-to-fit-width", value: msg.width },
      });
      // Copy out of the wasm heap into a standalone transferable buffer.
      const bytes = new Uint8Array(data);
      self.postMessage(
        { type: "thumbnail", id: msg.id, bytes },
        {
          transfer: [bytes.buffer],
        }
      );
    } catch (err) {
      self.postMessage({
        type: "error",
        id: msg.id,
        message: String((err as Error | null)?.message ?? err),
      });
    }
  })();
};
