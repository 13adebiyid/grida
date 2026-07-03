import type { GridaCanvasModuleInitOptions } from "@grida/canvas-wasm";
type Args = Parameters<GridaCanvasModuleInitOptions["locateFile"]>;

/**
 * Locate the wasm file in the correct location.
 * @returns The URL of the file.
 */
export default function locateFile(...args: Args) {
  const [path, version] = args;
  if (process.env.NEXT_PUBLIC_GRIDA_WASM_DEV_SERVE_URL) {
    return `${process.env.NEXT_PUBLIC_GRIDA_WASM_DEV_SERVE_URL}/${path}`;
  }
  // Vendored binary (static export): build-static.mjs copies the locally
  // built .wasm into public/wasm/ and bakes this base in. REQUIRED for the
  // Bible Helper bundle — the Emscripten JS glue is bundled at build time
  // from the workspace dist, so the runtime .wasm must come from the SAME
  // build; a CDN fetch of the published canary would mismatch (and require
  // internet at runtime).
  if (process.env.NEXT_PUBLIC_GRIDA_WASM_BASE) {
    return `${process.env.NEXT_PUBLIC_GRIDA_WASM_BASE}/${path}`;
  }
  return `https://unpkg.com/@grida/canvas-wasm@${version}/dist/${path}`;
}
