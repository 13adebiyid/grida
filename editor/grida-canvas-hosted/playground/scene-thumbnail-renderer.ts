/**
 * Client for the scene-thumbnail render worker (scene-thumbnail-worker.ts).
 *
 * Enterprise posture: thumbnails render in a SEPARATE wasm instance on a
 * worker thread, so the editor's main thread can never block on them. A
 * watchdog terminates a worker that misses the deadline (a synchronous wasm
 * hang is otherwise unkillable) and a fresh worker spawns lazily on the next
 * request; a scene that kills the worker POISON_STRIKES times is quarantined
 * for the session (stale/placeholder tile instead of a terminate loop).
 *
 * Bookkeeping: image bytes and font files are sent incrementally per WORKER
 * INSTANCE (the worker caches registrations across captures; a respawn
 * resets both sides).
 */

export interface ThumbnailCaptureRequest {
  docBytes: Uint8Array;
  sceneId: string;
  exportNodeId: string;
  width: number;
  /** Every image ref used by the document, with a bytes getter — only refs
   *  this worker instance hasn't seen are materialized and transferred. */
  imageRefs: string[];
  getImageBytes: (ref: string) => Uint8Array | null;
  /** Loaded font families with their file URLs (worker fetches them). */
  fonts: Array<{ family: string; urls: string[] }>;
  fallbackFonts: string[];
}

const WATCHDOG_MS = 10_000;
const POISON_STRIKES = 2;

export class SceneThumbnailRenderer {
  private worker: Worker | null = null;
  private seq = 0;
  private sentImages = new Set<string>();
  private sentFonts = new Set<string>();
  private pending: {
    id: number;
    sceneId: string;
    resolve: (bytes: Uint8Array) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private poisonStrikes = new Map<string, number>();

  /** True when the scene has repeatedly hung the render worker. */
  isQuarantined(sceneId: string): boolean {
    return (this.poisonStrikes.get(sceneId) ?? 0) >= POISON_STRIKES;
  }

  dispose() {
    this.teardownWorker(new Error("renderer disposed"));
  }

  /**
   * Render one thumbnail. Single-flight by construction — the provider
   * already serializes captures; concurrent calls reject.
   */
  capture(req: ThumbnailCaptureRequest): Promise<Uint8Array> {
    if (typeof Worker === "undefined") {
      return Promise.reject(new Error("workers unavailable"));
    }
    if (this.pending) {
      return Promise.reject(new Error("capture already in flight"));
    }
    if (this.isQuarantined(req.sceneId)) {
      return Promise.reject(new Error("scene quarantined"));
    }

    const worker = this.ensureWorker();
    const id = ++this.seq;

    const images: Array<{ rid: string; bytes: ArrayBuffer }> = [];
    for (const rid of req.imageRefs) {
      if (this.sentImages.has(rid)) continue;
      const bytes = req.getImageBytes(rid);
      // Unavailable bytes (e.g. surface not bound) are NOT marked as sent —
      // retried on a later capture.
      if (!bytes) continue;
      this.sentImages.add(rid);
      images.push({ rid, bytes: bytes.buffer as ArrayBuffer });
    }
    const fonts = req.fonts.filter((f) => !this.sentFonts.has(f.family));
    for (const f of fonts) this.sentFonts.add(f.family);

    // Tight copy: the FBS builder returns a subarray VIEW into a larger
    // backing buffer — transferring `.buffer` raw would hand the worker the
    // builder padding and shift the whole document.
    const docBytes =
      req.docBytes.byteOffset === 0 &&
      req.docBytes.byteLength === req.docBytes.buffer.byteLength
        ? req.docBytes
        : req.docBytes.slice();

    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Watchdog: the worker is presumed hung inside wasm — terminate it
        // (the only way to stop a synchronous wasm loop) and quarantine the
        // scene after repeated strikes.
        const strikes = (this.poisonStrikes.get(req.sceneId) ?? 0) + 1;
        this.poisonStrikes.set(req.sceneId, strikes);
        console.warn(
          `[thumbnails] render worker hung (scene ${req.sceneId}, strike ${strikes}/${POISON_STRIKES}) — terminating`
        );
        this.teardownWorker(new Error("thumbnail render timed out"));
      }, WATCHDOG_MS);

      this.pending = { id, sceneId: req.sceneId, resolve, reject, timer };

      worker.postMessage(
        {
          type: "capture",
          id,
          docBytes: docBytes.buffer,
          sceneId: req.sceneId,
          exportNodeId: req.exportNodeId,
          width: req.width,
          images,
          fonts,
          fallbackFonts: req.fallbackFonts,
        },
        [docBytes.buffer as ArrayBuffer, ...images.map((i) => i.bytes)]
      );
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(
      new URL("./scene-thumbnail-worker.ts", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: "thumbnail"; id: number; bytes: Uint8Array }
        | { type: "error"; id: number; message: string }
        | { type: "console"; level: string; text: string }
        | null;
      if (msg && msg.type === "console") {
        console.warn(`[thumbnails:worker:${msg.level}]`, msg.text);
        return;
      }
      if (
        !msg ||
        !this.pending ||
        this.pending.id !== (msg as { id: number }).id
      )
        return;
      const p = this.pending;
      this.pending = null;
      clearTimeout(p.timer);
      if (msg.type === "thumbnail") p.resolve(msg.bytes);
      else p.reject(new Error(msg.message));
    };
    worker.onerror = (e) => {
      // A worker-level error (script load, uncaught throw) fails the pending
      // capture and respawns lazily; it does NOT poison the scene — only
      // watchdog timeouts do.
      this.teardownWorker(new Error(e.message || "thumbnail worker error"));
    };
    this.worker = worker;
    return worker;
  }

  private teardownWorker(reason: Error) {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // The next worker instance starts empty — resend everything.
    this.sentImages.clear();
    this.sentFonts.clear();
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      clearTimeout(p.timer);
      p.reject(reason);
    }
  }
}
