import { describe, expect, it, vi } from "vitest";
import { pasteClipboardIntoActiveTextScene } from "./text-clipboard";

describe("text clipboard routing", () => {
  it("keeps normal paste inside an active text edit", async () => {
    const pasteText = vi.fn<(text: string) => void>();
    const redraw = vi.fn<() => void>();
    const handled = await pasteClipboardIntoActiveTextScene(
      {
        textEditIsActive: () => true,
        textEditPasteHtml: vi.fn<(html: string) => void>(),
        textEditPasteText: pasteText,
        redraw,
      },
      {
        read: async () => [
          {
            types: ["text/plain"],
            getType: async () => new Blob(["replacement"]),
          } as unknown as ClipboardItem,
        ],
        readText: async () => "fallback",
      }
    );

    expect(handled).toBe(true);
    expect(pasteText).toHaveBeenCalledWith("replacement");
    expect(redraw).toHaveBeenCalledOnce();
  });

  it("leaves layer paste to the caller outside text editing", async () => {
    const handled = await pasteClipboardIntoActiveTextScene(
      {
        textEditIsActive: () => false,
        textEditPasteHtml: vi.fn<(html: string) => void>(),
        textEditPasteText: vi.fn<(text: string) => void>(),
        redraw: vi.fn<() => void>(),
      },
      {
        read: vi.fn<() => Promise<ClipboardItems>>(async () => []),
        readText: vi.fn<() => Promise<string>>(async () => ""),
      }
    );

    expect(handled).toBe(false);
  });
});
