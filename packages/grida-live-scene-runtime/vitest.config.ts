import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@grida/canvas-wasm": new URL(
        "../../crates/grida-canvas-wasm/lib/index.ts",
        import.meta.url
      ).pathname,
      "@grida/io": new URL("../grida-canvas-io/index.ts", import.meta.url)
        .pathname,
    },
  },
});
