import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["index.ts"],
  format: ["esm"],
  platform: "neutral",
  dts: { eager: true },
  clean: true,
  alias: {
    "@grida/schema": new URL("../grida-canvas-schema/index.ts", import.meta.url)
      .pathname,
  },
  deps: {
    alwaysBundle: () => true,
    onlyBundle: false,
  },
});
