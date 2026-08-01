/**
 * @vitest-environment node
 *
 * Insert placement for Rhema (bible-helper) scenes.
 *
 * Operator-reported 2026-07-03: after deleting the stage container, adding a
 * picture re-created the stage via `getRhemaStage(true)` — and the picture
 * came up as an invisible "empty box". Two reducer defects compose:
 *
 *  1. A ROOT insert never skips the viewport packer, so the re-created
 *     "Canvas 1920x1080" stage container is shoved away from (0,0) to avoid
 *     overlapping siblings.
 *  2. The parent-relative inset subtraction runs even for bible-helper
 *     stage-local inserts (`skipAutoPlacement`), so with a displaced stage
 *     the child's STAGE-LOCAL prototype insets get "compensated" by the
 *     stage's absolute position — landing the child outside the clipping
 *     container. (With the stage at (0,0) the subtraction is a no-op, which
 *     is why this never surfaced before a stage was ever re-created.)
 */
import { describe, test, expect } from "vitest";
import documentReducer from "../document.reducer";
import type { DocumentEditorInsertNodeAction } from "@/grida-canvas/action";
import type { ReducerContext } from "@/grida-canvas/reducers";
import { createReducerContext } from "@/grida-canvas/__tests__/utils/stubs";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";

const RHEMA_STAGE_NAME = "Canvas 1920x1080";

function sceneDoc(opts?: {
  stage?: { left: number; top: number };
}): grida.program.document.Document {
  const nodes: Record<string, unknown> = {
    scene: {
      type: "scene",
      id: "scene",
      name: "Theme 1",
      active: true,
      locked: false,
      constraints: { children: "multiple" },
      guides: [],
      edges: [],
      background_color: null,
    },
    sibling: {
      id: "sibling",
      type: "rectangle",
      name: "Existing",
      active: true,
      locked: false,
      layout_positioning: "absolute",
      layout_inset_left: 0,
      layout_inset_top: 0,
      layout_target_width: 100,
      layout_target_height: 100,
      opacity: 1,
      rotation: 0,
      z_index: 0,
    },
  };
  const links: Record<string, string[]> = { scene: ["sibling"] };
  if (opts?.stage) {
    nodes["stage"] = {
      id: "stage",
      type: "container",
      name: RHEMA_STAGE_NAME,
      active: true,
      locked: false,
      layout_positioning: "absolute",
      layout_inset_left: opts.stage.left,
      layout_inset_top: opts.stage.top,
      layout_target_width: 1920,
      layout_target_height: 1080,
      clips_content: true,
      opacity: 1,
      rotation: 0,
      z_index: 0,
      expanded: false,
    };
    links["scene"] = ["sibling", "stage"];
    links["stage"] = [];
  }
  return {
    scenes_ref: ["scene"],
    links,
    nodes: nodes as grida.program.document.Document["nodes"],
    entry_scene_id: "scene",
    bitmaps: {},
    images: {},
    properties: {},
    metadata: {
      scene: {
        userdata: {
          rhema_profile: "bible-helper",
          rhema_lock_to_stage: true,
          ...(opts?.stage ? { rhema_stage_node_id: "stage" } : {}),
        },
      },
    },
  } as unknown as grida.program.document.Document;
}

function initState(doc: grida.program.document.Document) {
  return editor.state.init({
    editable: true,
    debug: false,
    document: doc,
    templates: {},
  });
}

function stagePrototype(): grida.program.nodes.NodePrototype {
  return {
    type: "container",
    name: RHEMA_STAGE_NAME,
    children: [],
    layout_positioning: "absolute",
    layout_inset_left: 0,
    layout_inset_top: 0,
    layout_target_width: 1920,
    layout_target_height: 1080,
    clips_content: true,
  } as unknown as grida.program.nodes.NodePrototype;
}

describe("insert placement in a bible-helper scene", () => {
  test("re-created Rhema stage container lands exactly at its prototype origin (0,0)", () => {
    const state = initState(sceneDoc());
    const action: DocumentEditorInsertNodeAction = {
      type: "insert",
      target: null,
      id: "new-stage",
      prototype: stagePrototype(),
    };
    const next = documentReducer(
      state,
      action,
      createReducerContext() as unknown as ReducerContext
    );
    const stage = next.document.nodes["new-stage"] as unknown as {
      layout_inset_left?: number;
      layout_inset_top?: number;
    };
    expect(stage).toBeDefined();
    expect(stage.layout_inset_left).toBe(0);
    expect(stage.layout_inset_top).toBe(0);
  });

  test("stage-local child insets are honored verbatim even when the stage is displaced", () => {
    const state = initState(sceneDoc({ stage: { left: -212, top: 1155 } }));
    // Geometry reports the stage's ABSOLUTE rect at its displaced position —
    // the buggy path subtracts it from the child's stage-local insets.
    const context = createReducerContext({
      geometry: {
        getNodeIdsFromPoint: () => [],
        getNodeIdsFromPointerEvent: () => [],
        getNodeIdsFromEnvelope: () => [],
        getNodeAbsoluteBoundingRect: () => ({
          x: -212,
          y: 1155,
          width: 1920,
          height: 1080,
        }),
        getNodeAbsoluteRotation: () => 0,
      },
    });
    const action: DocumentEditorInsertNodeAction = {
      type: "insert",
      target: "stage",
      id: "photo",
      prototype: {
        type: "rectangle",
        name: "photo.jpg",
        layout_positioning: "absolute",
        layout_inset_left: 240,
        layout_inset_top: 0,
        layout_target_width: 1440,
        layout_target_height: 1080,
      } as unknown as grida.program.nodes.NodePrototype,
    };
    const next = documentReducer(
      state,
      action,
      context as unknown as ReducerContext
    );
    const photo = next.document.nodes["photo"] as unknown as {
      layout_inset_left?: number;
      layout_inset_top?: number;
    };
    expect(photo).toBeDefined();
    // STAGE-LOCAL coords must survive: (240, 0) — not (240 - (-212), 0 - 1155).
    expect(photo.layout_inset_left).toBe(240);
    expect(photo.layout_inset_top).toBe(0);
    expect(next.document.links["stage"]).toContain("photo");
  });

  test("a scene-root paste is canonically reparented and contained by the stage", () => {
    const state = initState(sceneDoc({ stage: { left: 0, top: 0 } }));
    const action: DocumentEditorInsertNodeAction = {
      type: "insert",
      target: "scene",
      id: "pasted-text",
      prototype: {
        type: "tspan",
        name: "Pasted text",
        text: "Pasted text",
        layout_positioning: "absolute",
        layout_inset_left: 1900,
        layout_inset_top: -20,
        layout_target_width: 200,
        layout_target_height: 80,
      } as unknown as grida.program.nodes.NodePrototype,
    };

    const next = documentReducer(
      state,
      action,
      createReducerContext() as unknown as ReducerContext
    );

    expect(next.document.links.scene).not.toContain("pasted-text");
    expect(next.document.links.stage).toContain("pasted-text");
    const text = next.document.nodes["pasted-text"] as unknown as {
      layout_inset_left: number;
      layout_inset_top: number;
    };
    expect(text.layout_inset_left).toBe(1720);
    expect(text.layout_inset_top).toBe(0);
  });
});
