"use client";

import React, { useEffect } from "react";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import {
  Tree,
  TreeItem,
  TreeItemLabel,
  TreeDragLine,
} from "@/components/ui-editor/tree";
import {
  dragAndDropFeature,
  selectionFeature,
  renamingFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/components/lib/utils";
import { NameInput } from "./tree-item-name-input";
import grida from "@grida/schema";
import { useSceneThumbnail } from "./scene-thumbnail-cache";

/**
 * In-memory clipboard for scene copy/paste. Module-level so it
 * survives the menu close/reopen cycle but doesn't leak across tabs
 * (we don't put scene contents in localStorage — the clipboard just
 * remembers "which scene id to duplicate"; the actual node data
 * remains in the editor's state until Paste fires). Cross-tab paste
 * is a future enhancement (would need full scene-serialization).
 */
const sceneClipboard: { sceneId: string | null } = { sceneId: null };

function SceneItemContextMenuWrapper({
  scene_id,
  onStartRenaming,
  children,
}: React.PropsWithChildren<{
  scene_id: string;
  onStartRenaming?: () => void;
}>) {
  const editor = useCurrentEditor();
  const { scenes_count, copy_target_exists } = useEditorState(
    editor,
    (state) => ({
      scenes_count: state.document.scenes_ref.length,
      // Paste is enabled only when a scene id was copied AND that scene
      // still exists in the document (deletion/swap can invalidate the
      // clipboard).
      copy_target_exists:
        sceneClipboard.sceneId !== null &&
        state.document.scenes_ref.includes(sceneClipboard.sceneId),
    })
  );

  // a11y/bug prevent scene from being deleted if len === 1
  const is_last_scene = scenes_count === 1;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full h-full">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem
          onSelect={() => {
            sceneClipboard.sceneId = scene_id;
          }}
          className="text-xs"
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            if (sceneClipboard.sceneId) {
              editor.commands.duplicateScene(sceneClipboard.sceneId);
            }
          }}
          disabled={!copy_target_exists}
          className="text-xs"
        >
          Paste
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            editor.commands.deleteScene(scene_id);
            if (sceneClipboard.sceneId === scene_id) {
              sceneClipboard.sceneId = null;
            }
          }}
          disabled={is_last_scene}
          className="text-xs"
        >
          Delete
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            onStartRenaming?.();
          }}
          disabled={!onStartRenaming}
          className="text-xs"
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            editor.commands.duplicateScene(scene_id);
          }}
          className="text-xs"
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/* Copy Text Style / Paste Text Style — text-node operations.
            Disabled on scene-level menu; will be added to the per-node
            context menu in a follow-up commit. */}
        <ContextMenuItem disabled className="text-xs">
          Copy Text Style
        </ContextMenuItem>
        <ContextMenuItem disabled className="text-xs">
          Paste Text Style
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * 16:9 thumbnail for a scene tile. Shows the live/cached SVG when available,
 * else a placeholder. `index` is the 1-based slide number (ProPresenter-style).
 */
function SceneTileThumb({
  sceneId,
  index,
}: {
  sceneId: string;
  index: number;
}) {
  const thumb = useSceneThumbnail(sceneId);
  return (
    <div className="flex items-center gap-2 w-full min-w-0">
      <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground text-right">
        {index}
      </span>
      <div className="relative flex-1 min-w-0 aspect-video rounded-sm overflow-hidden border border-border bg-muted/40">
        {thumb ? (
          <img
            src={thumb.dataUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[9px] text-muted-foreground">
            No Preview Available
          </div>
        )}
      </div>
    </div>
  );
}

export function ScenesList() {
  const editor = useCurrentEditor();
  const { scenesmap, scenes_ref } = useEditorState(editor, (state) => {
    // Build scenes map from scenes_ref for backward compatibility
    type SceneEntry = grida.program.nodes.SceneNode & {
      children_refs: string[];
    };
    const scenesmap: Record<string, SceneEntry> =
      state.document.scenes_ref.reduce(
        (acc: Record<string, SceneEntry>, scene_id: string) => {
          const scene_node = state.document.nodes[
            scene_id
          ] as grida.program.nodes.SceneNode;
          const children_refs = state.document.links[scene_id] || [];
          acc[scene_id] = {
            ...scene_node,
            children_refs,
          };
          return acc;
        },
        {} as Record<string, SceneEntry>
      );

    return {
      scenesmap,
      scenes_ref: state.document.scenes_ref,
    };
  });
  const scene_id = useEditorState(editor, (state) => state.scene_id);

  const tree = useTree<grida.program.nodes.SceneNode>({
    rootItemId: "<document>",
    canReorder: true,
    initialState: {
      selectedItems: scene_id ? [scene_id] : [],
    },
    state: {
      selectedItems: scene_id ? [scene_id] : [],
    },
    setSelectedItems: (items) => {
      editor.commands.loadScene((items as string[])[0]);
    },
    getItemName: (item) => {
      if (item.getId() === "<document>") return "<document>";
      return item.getItemData().name;
    },
    isItemFolder: (_item) => false,
    onDrop(items, target) {
      const ids = items.map((item) => item.getId());

      // Only allow reordering scenes within document root
      if (
        target.item.getId() !== "<document>" ||
        ids.some((id) => !scenes_ref.includes(id))
      ) {
        return;
      }

      // Remove dragged scenes from current order
      const draggedSet = new Set(ids);
      const remaining = scenes_ref.filter((id) => !draggedSet.has(id));

      // Calculate insertion index
      const insertionIndex =
        "insertionIndex" in target && typeof target.insertionIndex === "number"
          ? Math.max(0, Math.min(target.insertionIndex, remaining.length))
          : 0;

      // Reorder scenes
      const newOrder = [
        ...remaining.slice(0, insertionIndex),
        ...ids,
        ...remaining.slice(insertionIndex),
      ];

      editor.commands.reorderScenes(newOrder);
    },
    dataLoader: {
      getItem(itemId) {
        const item = scenesmap[itemId];
        if (item) return item;
        // Root or deleted scene: tree may hold stale refs until rebuildTree runs.
        // Return a stub so syncDataLoaderFeature doesn't throw "returned undefined".
        if (itemId === "<document>") {
          return {
            id: "<document>",
            name: "<document>",
          } as grida.program.nodes.SceneNode;
        }
        return { id: itemId, name: "" } as grida.program.nodes.SceneNode;
      },
      getChildren: (itemId) => {
        if (itemId === "<document>") {
          // Use scenes_ref order directly instead of sorting by position
          return scenes_ref;
        }
        return [];
      },
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      dragAndDropFeature,
      renamingFeature,
    ],
  });

  // Focus and scroll to selected scene when it changes
  useEffect(() => {
    if (!scene_id || !tree) return;

    const selectedItem = tree
      .getItems()
      .find((item) => item.getId() === scene_id);

    if (selectedItem) {
      // Focus the selected item
      selectedItem.setFocused();

      // Scroll the item into view with smooth behavior
      selectedItem.scrollTo({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [scene_id, tree]);

  useEffect(() => {
    tree.rebuildTree();
  }, [scenes_ref, tree]);

  return (
    <Tree tree={tree} indent={0}>
      {tree.getItems().map((item, sceneIndex) => {
        const scene = item.getItemData();
        if (!scene || !scenesmap[scene.id]) return null;
        const isRenaming = item.isRenaming();
        return (
          <SceneItemContextMenuWrapper
            scene_id={scene.id}
            key={scene.id}
            onStartRenaming={() => {
              setTimeout(() => {
                item.startRenaming();
              }, 200);
            }}
          >
            <TreeItem
              item={item}
              className="group/item w-full py-1"
              data-is-renaming={isRenaming}
            >
              <TreeItemLabel
                className={cn(
                  "h-auto bg-transparent px-1! py-1 flex-col items-stretch gap-1",
                  "!outline-none !ring-0",
                  scene.id === scene_id && "ring-2 ring-primary rounded-md"
                )}
                onDoubleClick={() => {
                  item.startRenaming();
                }}
              >
                <SceneTileThumb sceneId={scene.id} index={sceneIndex + 1} />
                {isRenaming ? (
                  <NameInput
                    isRenaming={isRenaming}
                    initialValue={scene.name}
                    onValueCommit={(name) => {
                      editor.commands.renameScene(scene.id, name);
                      tree.abortRenaming();
                    }}
                    className="px-1 py-0.5 text-[11px] font-normal"
                  />
                ) : (
                  <div className="flex items-center min-w-0 w-full px-1">
                    <NameInput
                      isRenaming={false}
                      initialValue={scene.name}
                      className="text-[11px] font-normal min-w-0 flex-1"
                    />
                  </div>
                )}
              </TreeItemLabel>
            </TreeItem>
          </SceneItemContextMenuWrapper>
        );
      })}
      <TreeDragLine />
    </Tree>
  );
}
