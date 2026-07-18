import { describe, expect, test, vi } from "vitest";
import {
  forwardTextEditPointerDown,
  forwardTextEditPointerMove,
} from "./surface-text-editor";

describe("WASM text edit pointer relay", () => {
  test("forwards camera-derived canvas coordinates to the native transform path", () => {
    const scene = {
      textEditPointerDownCanvas: vi.fn<
        (x: number, y: number, shift: boolean, count: number) => boolean
      >(() => true),
      textEditPointerMoveCanvas: vi.fn<(x: number, y: number) => boolean>(
        () => true
      ),
    };
    const camera = {
      clientPointToCanvasPoint: vi.fn<
        (point: [number, number]) => [number, number]
      >(() => [310, 260]),
    };

    expect(forwardTextEditPointerDown(scene, camera, 700, 500, true, 2)).toBe(
      true
    );
    expect(scene.textEditPointerDownCanvas).toHaveBeenCalledWith(
      310,
      260,
      true,
      2
    );

    expect(forwardTextEditPointerMove(scene, camera, 720, 520)).toBe(true);
    expect(scene.textEditPointerMoveCanvas).toHaveBeenCalledWith(310, 260);
  });
});
