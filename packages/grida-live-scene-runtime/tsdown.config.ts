import { defineConfig } from "tsdown";

const sibling = (name: string) =>
  new URL(`../${name}/index.ts`, import.meta.url).pathname;

export default defineConfig({
  entry: ["index.ts"],
  format: ["esm"],
  platform: "browser",
  dts: { eager: true },
  clean: true,
  alias: {
    "@grida/canvas-wasm": new URL(
      "../../crates/grida-canvas-wasm/lib/index.ts",
      import.meta.url
    ).pathname,
    "@grida/format": new URL("../grida-format/src/index.ts", import.meta.url)
      .pathname,
    "@grida/io": sibling("grida-canvas-io"),
    "@grida/schema": sibling("grida-canvas-schema"),
    "@grida/sequence": sibling("grida-canvas-sequence"),
    "@grida/vn": sibling("grida-canvas-vn"),
  },
  deps: {
    alwaysBundle: () => true,
    onlyBundle: false,
  },
});
