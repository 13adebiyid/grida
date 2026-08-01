import type { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";

const RHEMA_PROFILE = "bible-helper";
const RHEMA_STAGE_NAME = /^Canvas \d+x\d+$/;

function isContainerInScene(
  state: editor.state.IEditorState,
  sceneId: string,
  nodeId: string
): boolean {
  const node = state.document.nodes[nodeId];
  return (
    node?.type === "container" &&
    (state.document.links[sceneId] ?? []).includes(nodeId)
  );
}

/** Resolve the fixed authoring frame for a Rhema scene.
 *
 * The metadata reference is canonical. The name fallback only repairs legacy
 * Rhema scenes which already carry the profile/lock marker but lost the stage
 * reference; an arbitrary large container in a normal Grida scene is never
 * promoted to a stage.
 */
export function resolveRhemaStageId(
  state: editor.state.IEditorState
): string | null {
  const sceneId = state.scene_id;
  if (!sceneId) return null;

  const userdata = state.document.metadata?.[sceneId]?.userdata as
    | Record<string, unknown>
    | undefined;
  const explicit = userdata?.rhema_stage_node_id;
  const hasValidExplicitStage =
    typeof explicit === "string" &&
    isContainerInScene(state, sceneId, explicit);
  const isRhemaScene =
    userdata?.rhema_profile === RHEMA_PROFILE ||
    userdata?.rhema_lock_to_stage === true ||
    hasValidExplicitStage;
  if (!isRhemaScene) return null;

  if (hasValidExplicitStage) {
    return explicit;
  }

  return (
    (state.document.links[sceneId] ?? []).find((id) => {
      const node = state.document.nodes[id];
      return node?.type === "container" && RHEMA_STAGE_NAME.test(node.name);
    }) ?? null
  );
}

function isWithinParent(
  state: editor.state.IEditorState,
  nodeId: string | null,
  parentId: string
): boolean {
  let cursor = nodeId;
  while (cursor) {
    if (cursor === parentId) return true;
    cursor = dq.getParentId(state.document_ctx, cursor);
  }
  return false;
}

function constrainToRhemaStage(
  state: editor.state.IEditorState,
  target: string | null
): string | null {
  const stageId = resolveRhemaStageId(state);
  if (!stageId) return target;
  return isWithinParent(state, target, stageId) ? target : stageId;
}

/**
 * Resolves target parent ID from current selection for insert operation.
 *
 * Logic:
 * - If selected node is a container -> use it as parent (insert as child)
 * - If selected node is not a container -> use its parent (insert as sibling)
 * - If no selection -> return null (scene-level)
 *
 * @param state - Current editor state
 * @param selection - Current selection array
 * @returns Target parent node ID or null for scene-level insertion
 */
export function resolveInsertTargetParent(
  state: editor.state.IEditorState,
  selection: string[]
): string | null {
  if (selection.length === 0) return constrainToRhemaStage(state, null);

  const node_id = selection[0];
  const node = dq.__getNodeById(state, node_id);

  if (!node) return constrainToRhemaStage(state, null);

  if (node.type === "container" || node.type === "tray") {
    return constrainToRhemaStage(state, node_id);
  }

  return constrainToRhemaStage(
    state,
    dq.getParentId(state.document_ctx, node_id)
  );
}

/**
 * Resolves target parent IDs from a selection array.
 *
 * Logic:
 * - If selected node is a container -> use it as parent (paste as child)
 * - If selected node is not a container -> use its parent as parent (paste as sibling)
 * - Returns array of target parent IDs (null represents scene-level)
 * - Filters out nodes that are in the copiedIds (can't paste into originals)
 */
export function resolvePasteTargetParents(
  state: editor.state.IEditorState,
  selection: string[],
  copiedIds: string[]
): Array<string | null> {
  const targets = Array.from(
    new Set(
      selection
        .map((node_id) => {
          const node = dq.__getNodeById(state, node_id);

          // If node is a container or tray, use it as target parent (paste as child)
          if (node.type === "container" || node.type === "tray") {
            return node_id;
          }

          // Otherwise, use its parent as target parent (paste as sibling)
          const parent_id = dq.getParentId(state.document_ctx, node_id);

          // Parent can be null (scene) or a container/tray
          if (!parent_id) return null;

          const parent = dq.__getNodeById(state, parent_id);
          // Only return valid container/tray parents
          return parent?.type === "container" || parent?.type === "tray"
            ? parent_id
            : null;
        })
        .filter((target_id) => {
          // Ensure target parent is not one of the originals
          if (target_id && copiedIds.includes(target_id)) return false;
          return true;
        })
    )
  );

  if (targets.length === 0) {
    return [constrainToRhemaStage(state, null)];
  }
  return targets.map((target) => constrainToRhemaStage(state, target));
}
