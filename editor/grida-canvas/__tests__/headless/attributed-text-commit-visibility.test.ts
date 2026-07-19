/** @vitest-environment node */
import { inflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import type grida from "@grida/schema";
import { createEditorWithWasmSync } from "../bench/_utils";
import { sceneNode, textNode } from "../utils/factories";

function document(): grida.program.document.Document {
  const base = textNode("body", "Original prayer words");
  const body = {
    ...base,
    type: "text",
    layout_target_width: 600,
    layout_target_height: 120,
    default_style: {
      font_family: "Inter",
      font_size: 48,
      font_weight: 400,
      font_kerning: true,
      text_decoration_line: "none",
    },
    fill_paints: [base.fill],
    styled_runs: [
      {
        start: 0,
        end: "Original prayer words".length,
        style: {
          font_family: "Inter",
          font_size: 48,
          font_weight: 400,
          font_kerning: true,
          text_decoration_line: "none",
        },
        fill_paints: [base.fill],
      },
    ],
  } as unknown as grida.program.nodes.Node;
  return {
    scenes_ref: ["scene"],
    entry_scene_id: "scene",
    nodes: { scene: sceneNode("scene"), body },
    links: { scene: ["body"], body: [] },
    images: {},
    bitmaps: {},
    properties: {},
  };
}

function verticallyCenteredDocument(): grida.program.document.Document {
  const doc = document();
  const body = doc.nodes.body as unknown as Record<string, unknown>;
  const text = "TOP LINE\nBOTTOM LINE";
  body.text = text;
  body.layout_inset_left = 100;
  body.layout_inset_top = 50;
  body.layout_target_width = 600;
  body.layout_target_height = 300;
  body.text_align_vertical = "center";
  body.styled_runs = [
    {
      start: 0,
      end: text.length,
      style: body.default_style,
      fill_paints: body.fill_paints,
    },
  ];
  return doc;
}

function pngVisibleAlphaPixels(data: Uint8Array): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const idat: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...data.slice(offset + 4, offset + 8));
    const chunk = data.slice(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      const header = new DataView(
        chunk.buffer,
        chunk.byteOffset,
        chunk.byteLength
      );
      width = header.getUint32(0);
      height = header.getUint32(4);
      if (chunk[8] !== 8 || chunk[9] !== 6) {
        throw new Error("expected an 8-bit RGBA PNG");
      }
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const compressed = Buffer.concat(idat.map((chunk) => Buffer.from(chunk)));
  const raw = inflateSync(compressed);
  const stride = width * 4;
  const previous = new Uint8Array(stride);
  let visible = 0;
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor++];
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const source = raw[cursor++];
      const left = x >= 4 ? row[x - 4]! : 0;
      const up = previous[x]!;
      const upLeft = x >= 4 ? previous[x - 4]! : 0;
      const paeth = (() => {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      })();
      row[x] =
        (source +
          (filter === 0
            ? 0
            : filter === 1
              ? left
              : filter === 2
                ? up
                : filter === 3
                  ? Math.floor((left + up) / 2)
                  : paeth)) &
        0xff;
    }
    for (let x = 3; x < stride; x += 4) {
      if (row[x]! > 0) visible += 1;
    }
    previous.set(row);
  }
  return visible;
}

describe("attributed text surface commit visibility", () => {
  test("edited text remains painted after leaving text mode", async () => {
    const handle = await createEditorWithWasmSync(document(), {
      width: 800,
      height: 300,
    });
    try {
      const before = handle.scene.exportNodeAs("body", {
        format: "PNG",
        constraints: { type: "none", value: 1 },
      });
      expect(pngVisibleAlphaPixels(before.data)).toBeGreaterThan(50);
      expect(handle.scene.textEditEnter("body")).toBe(true);
      handle.scene.textEditCommand({ type: "SelectAll" });
      handle.scene.textEditCommand({
        type: "Insert",
        text: "Changed prayer words",
      });
      const committed = handle.scene.textEditExit(true);
      expect(committed).toBe("Changed prayer words");
      handle.ed.commands.changeNodePropertyText("body", committed);

      const { data } = handle.scene.exportNodeAs("body", {
        format: "PNG",
        constraints: { type: "none", value: 1 },
      });
      expect(pngVisibleAlphaPixels(data)).toBeGreaterThan(50);
      expect(
        (handle.ed.state.document.nodes.body as { text?: string }).text
      ).toBe("Changed prayer words");
    } finally {
      handle.dispose();
    }
  }, 30_000);

  test("canvas-space pointer hit testing accounts for vertical text alignment", async () => {
    const handle = await createEditorWithWasmSync(
      verticallyCenteredDocument(),
      {
        width: 900,
        height: 450,
      }
    );
    try {
      expect(handle.scene.textEditEnter("body")).toBe(true);
      // The two 48px lines are vertically centered in a 300px-high node at
      // y=50. This point is at the far-left of the visually painted TOP line.
      // Treating it as unadjusted layout-local space lands on the bottom line.
      expect(handle.scene.textEditPointerDownCanvas(101, 171, false, 1)).toBe(
        true
      );
      handle.scene.textEditPointerUp();
      handle.scene.textEditCommand({ type: "Insert", text: "X" });
      expect(handle.scene.textEditExit(true)).toBe("XTOP LINE\nBOTTOM LINE");
    } finally {
      handle.dispose();
    }
  }, 30_000);
});
