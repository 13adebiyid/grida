import { describe, expect, test, vi } from "vitest";
import type { Editor } from "./editor";
import { DocumentFontManager } from "./font-manager";

describe("DocumentFontManager", () => {
  test("retries document fonts when the host font registry is hydrated", async () => {
    const subscribers: Array<(doc: unknown, selectedValue: unknown) => void> =
      [];
    const loadFontSync = vi.fn<(font: { family: string }) => Promise<void>>(
      async () => undefined
    );
    const doc = {
      state: {
        fontfaces: [{ family: "Avenir Next", italic: false }],
        webfontlist: { kind: "webfonts#webfontList", items: [] },
      },
      subscribeWithSelector: (
        _selector: unknown,
        callback: (doc: unknown, selectedValue: unknown) => void
      ) => {
        subscribers.push(callback);
        return () => undefined;
      },
    };
    const instance = {
      doc,
      listLoadedFonts: () => [],
      loadFontSync,
    } as unknown as Editor;

    const manager = new DocumentFontManager(instance);
    expect(subscribers).toHaveLength(2);

    subscribers[1](doc, doc.state.webfontlist);
    await manager.ensureRequiredFontsLoaded();

    expect(loadFontSync).toHaveBeenCalledTimes(1);
    expect(loadFontSync).toHaveBeenCalledWith({ family: "Avenir Next" });
  });
});
