import { describe, expect, it } from "vitest";
import { editor } from "@/grida-canvas";
import { createHeadlessEditor } from "@/grida-canvas/__tests__/utils";
import { dq } from "@/grida-canvas/query";
import type grida from "@grida/schema";
import {
  resolveInsertTargetParent,
  resolvePasteTargetParents,
  resolveRhemaStageId,
} from "../insertion-targeting";

function rhemaState(): editor.state.IEditorState {
  const document = {
    scenes_ref: ["scene"],
    entry_scene_id: "scene",
    nodes: {
      scene: {
        id: "scene",
        type: "scene",
        name: "Slide 1",
        constraints: { children: "multiple" },
        guides: [],
        edges: [],
      },
      stage: {
        id: "stage",
        type: "container",
        name: "Canvas 1920x1080",
        layout_positioning: "absolute",
        layout_inset_left: 0,
        layout_inset_top: 0,
        layout_target_width: 1920,
        layout_target_height: 1080,
        clips_content: true,
      },
      text: {
        id: "text",
        type: "tspan",
        name: "Text",
        text: "Hello",
        layout_positioning: "absolute",
        layout_inset_left: 100,
        layout_inset_top: 100,
        layout_target_width: "auto",
        layout_target_height: "auto",
      },
      legacyRoot: {
        id: "legacyRoot",
        type: "rectangle",
        name: "Legacy root",
        layout_positioning: "absolute",
        layout_inset_left: 0,
        layout_inset_top: 0,
        layout_target_width: 100,
        layout_target_height: 100,
      },
    },
    links: {
      scene: ["stage", "legacyRoot"],
      stage: ["text"],
    },
    metadata: {
      scene: {
        userdata: {
          rhema_profile: "bible-helper",
          rhema_lock_to_stage: true,
          rhema_stage_node_id: "stage",
        },
      },
    },
    images: {},
    bitmaps: {},
    properties: {},
  } as unknown as grida.program.document.Document;

  return editor.state.init({
    editable: true,
    debug: false,
    document,
    templates: {},
  });
}

describe("Rhema insertion targeting", () => {
  it("uses the stage for an unselected external insert", () => {
    const state = rhemaState();
    expect(resolveRhemaStageId(state)).toBe("stage");
    expect(resolveInsertTargetParent(state, [])).toBe("stage");
  });

  it("trusts a validated native stage reference before legacy profile repair", () => {
    const state = rhemaState();
    const metadata = state.document.metadata?.scene;
    if (metadata) {
      metadata.userdata = { rhema_stage_node_id: "stage" };
    }

    expect(resolveRhemaStageId(state)).toBe("stage");
    expect(resolveInsertTargetParent(state, [])).toBe("stage");
  });

  it("keeps sibling inserts under the stage", () => {
    const state = rhemaState();
    expect(resolveInsertTargetParent(state, ["text"])).toBe("stage");
    expect(resolvePasteTargetParents(state, ["text"], [])).toEqual(["stage"]);
  });

  it("repairs insertion beside a legacy scene-root child", () => {
    const state = rhemaState();
    expect(resolveInsertTargetParent(state, ["legacyRoot"])).toBe("stage");
  });

  it("does not infer a stage in an ordinary Grida scene", () => {
    const state = rhemaState();
    state.document.metadata = {};
    expect(resolveRhemaStageId(state)).toBeNull();
    expect(resolveInsertTargetParent(state, [])).toBeNull();
  });

  it("parents programmatic plain text to the stage with operator-scale text", () => {
    const state = rhemaState();
    const instance = createHeadlessEditor({ document: state.document });
    const node = instance.commands.createTextNode("Pasted text");

    expect(dq.getParentId(instance.state.document_ctx, node.id)).toBe("stage");
    expect(node.$.font_size).toBe(48);
    instance.dispose();
  });

  it("keeps an internal copy/paste under the stage when selection is empty", () => {
    const state = rhemaState();
    const instance = createHeadlessEditor({ document: state.document });
    instance.commands.copy("text");
    instance.commands.select([]);

    instance.surface.a11yPaste();

    const stageChildren = instance.state.document.links.stage ?? [];
    expect(stageChildren).toHaveLength(2);
    const pastedId = stageChildren.find((id) => id !== "text");
    expect(pastedId).toBeDefined();
    expect(
      dq.getParentId(instance.state.document_ctx, pastedId as string)
    ).toBe("stage");
    instance.dispose();
  });

  it("does not allow the fixed stage host to become a transform selection", () => {
    const state = rhemaState();
    const instance = createHeadlessEditor({ document: state.document });

    instance.commands.select(["stage"]);

    expect(instance.state.selection).toEqual([]);
    instance.dispose();
  });
});
