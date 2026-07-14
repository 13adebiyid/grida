/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type grida from "@grida/schema";
import { Editor } from "@/grida-canvas/editor";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { rectNode, sceneNode } from "@/grida-canvas/__tests__/utils/factories";

const clip = (
  overrides: Partial<grida.program.document.animation.Clip> = {}
): grida.program.document.animation.Clip => ({
  id: "build-1",
  scene_id: "scene",
  target_node_id: "node",
  phase: "enter",
  trigger: "operator-advance",
  depends_on: [],
  order: 1,
  delay_seconds: 0,
  duration_seconds: 1,
  easing: "linear",
  fill: "forwards",
  iterations: 1,
  tracks: [{ property: "opacity", from: 0, to: 1 }],
  media_action: "none",
  media_value: 0,
  ...overrides,
});

function document(): grida.program.document.Document {
  return {
    scenes_ref: ["scene"],
    entry_scene_id: "scene",
    nodes: {
      scene: sceneNode("scene", "Scene"),
      node: rectNode("node", { name: "Title" }),
    },
    links: { scene: ["node"] },
    images: {},
    bitmaps: {},
    properties: {},
    animations: {
      "build-1": clip(),
      "build-2": clip({
        id: "build-2",
        trigger: "after-previous",
        depends_on: ["build-1"],
      }),
    },
  };
}

describe("native animation repository reducers", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = createHeadlessEditor({ document: document(), editable: true });
  });

  afterEach(() => editor.dispose());

  test("edits are undoable and invalid graphs are rejected atomically", () => {
    editor.doc.changeAnimation("build-1", { duration_seconds: 2 });
    expect(
      editor.state.document.animations?.["build-1"]?.duration_seconds
    ).toBe(2);
    editor.doc.undo();
    expect(
      editor.state.document.animations?.["build-1"]?.duration_seconds
    ).toBe(1);
    editor.doc.changeAnimation("build-1", { depends_on: ["build-2"] });
    expect(editor.state.document.animations?.["build-1"]?.depends_on).toEqual(
      []
    );
  });

  test("requires explicit cascade when deleting a dependency", () => {
    editor.doc.deleteAnimation("build-1");
    expect(Object.keys(editor.state.document.animations ?? {})).toHaveLength(2);
    editor.doc.deleteAnimation("build-1", true);
    expect(editor.state.document.animations).toEqual({});
    editor.doc.undo();
    expect(Object.keys(editor.state.document.animations ?? {})).toHaveLength(2);
  });

  test("deleting an animation target removes its dependent build chain", () => {
    editor.doc.dispatch({ type: "delete", target: ["node"] });
    expect(editor.state.document.nodes.node).toBeUndefined();
    expect(editor.state.document.animations).toEqual({});
  });
});
