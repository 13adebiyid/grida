import { describe, expect, it, vi } from "vitest";
import { pasteTextMatchingDestinationStyle } from "./paste-match-style";

describe("paste and match text style", () => {
  it("inserts plain text into the active destination run", () => {
    const paste = vi.fn<(text: string) => void>();
    const redraw = vi.fn<() => void>();
    const result = pasteTextMatchingDestinationStyle(
      {
        textEditIsActive: () => true,
        textEditPasteText: paste,
        redraw,
      },
      "hello my name is"
    );

    expect(result).toBe(true);
    expect(paste).toHaveBeenCalledWith("hello my name is");
    expect(redraw).toHaveBeenCalledOnce();
  });

  it("does not paste outside active text editing", () => {
    const paste = vi.fn<(text: string) => void>();
    const result = pasteTextMatchingDestinationStyle(
      {
        textEditIsActive: () => false,
        textEditPasteText: paste,
        redraw: vi.fn<() => void>(),
      },
      "hello"
    );

    expect(result).toBe(false);
    expect(paste).not.toHaveBeenCalled();
  });
});
