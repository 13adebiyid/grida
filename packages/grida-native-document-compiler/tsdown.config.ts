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
    "@grida/cg": sibling("grida-canvas-cg"),
    "@grida/color": sibling("grida-canvas-color"),
    "@grida/cmath": sibling("grida-cmath"),
    "@grida/format": new URL("../grida-format/src/index.ts", import.meta.url)
      .pathname,
    "@grida/io/compiler": new URL(
      "../grida-canvas-io/compiler.ts",
      import.meta.url
    ).pathname,
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
