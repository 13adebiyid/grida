/**
 * @vitest-environment node
 *
 * Imported ProPresenter mixed-style text compiles to AttributedText nodes
 * (`type: "text"`), not TextSpan. Rhema WP6 regressions:
 *   1. double-click auto content-edit must enter text mode for them (the
 *      wasm engine supports attributed sessions end-to-end; the reducer
 *      was the only gate);
 *   2. a plain-text commit must drop stale styled-run offsets from the
 *      DOCUMENT (they describe the previous characters) instead of saving
 *      a corrupted attributed node.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { sceneNode, textNode } from "@/grida-canvas/__tests__/utils/factories";
import type grida from "@grida/schema";
import type cg from "@grida/cg";
import kolor from "@grida/color";

function attributedTextNode(
  id: string,
  text: string,
  styled_runs: Array<{ start: number; end: number; style: object }>
): grida.program.nodes.Node {
  return {
    ...textNode(id, text),
    type: "text",
    styled_runs,
  } as unknown as grida.program.nodes.Node;
}

function createDocument(): grida.program.document.Document {
  return {
    scenes_ref: ["scene1"],
    links: {
      scene1: ["attributed-1", "tspan-1"],
    },
    nodes: {
      scene1: sceneNode("scene1", "Scene 1"),
      "attributed-1": attributedTextNode("attributed-1", "Baked words", [
        { start: 0, end: 5, style: { font_weight: 700 } },
      ]),
      "tspan-1": textNode("tspan-1", "Plain words"),
    },
    entry_scene_id: "scene1",
    images: {},
    bitmaps: {},
    properties: {},
  };
}

describe("attributed text (type: 'text') editing", () => {
  let ed: Editor;

  beforeEach(() => {
    ed = createHeadlessEditor({ document: createDocument() });
  });

  afterEach(() => {
    ed.dispose();
  });

  test("auto content-edit mode enters text editing on an attributed node", () => {
    ed.doc.select(["attributed-1"]);
    ed.surface.surfaceTryEnterContentEditMode();
    expect(ed.state.content_edit_mode).toEqual({
      type: "text",
      node_id: "attributed-1",
    });
  });

  test("auto content-edit mode still enters text editing on a tspan", () => {
    ed.doc.select(["tspan-1"]);
    ed.surface.surfaceTryEnterContentEditMode();
    expect(ed.state.content_edit_mode).toEqual({
      type: "text",
      node_id: "tspan-1",
    });
  });

  test("a plain-text commit drops stale styled runs from the document", () => {
    ed.commands.changeNodePropertyText("attributed-1", "New words entirely");
    const node = ed.state.document.nodes["attributed-1"] as unknown as {
      text: string;
      styled_runs: unknown[];
    };
    expect(node.text).toBe("New words entirely");
    expect(node.styled_runs).toEqual([]);
  });

  test("an unchanged-text commit preserves styled runs", () => {
    ed.commands.changeNodePropertyText("attributed-1", "Baked words");
    const node = ed.state.document.nodes["attributed-1"] as unknown as {
      styled_runs: unknown[];
    };
    expect(node.styled_runs).toHaveLength(1);
  });

  test("a whole-node fill edit updates attributed run paints", () => {
    const red = {
      type: "solid",
      color: kolor.colorformats.newRGBA32F(1, 0, 0, 1),
      active: true,
    } satisfies cg.SolidPaint;

    ed.doc.changeNodePropertyFills("attributed-1", [red]);

    const node = ed.state.document.nodes["attributed-1"] as unknown as {
      fill_paints: cg.Paint[];
      styled_runs: Array<{ fill_paints: cg.Paint[] }>;
    };
    expect(node.fill_paints[0]).toMatchObject(red);
    expect(node.styled_runs[0].fill_paints[0]).toMatchObject(red);
  });

  test("tspan text commits are unaffected", () => {
    ed.commands.changeNodePropertyText("tspan-1", "Other words");
    const node = ed.state.document.nodes["tspan-1"] as unknown as {
      text: string;
    };
    expect(node.text).toBe("Other words");
  });
});
