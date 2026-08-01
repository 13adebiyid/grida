import { useCallback, useMemo } from "react";
import { useCurrentEditor, useEditorState } from "./use-editor";
import { useBackendState } from "./provider";
import { useDataTransferEventTarget } from "./use-data-transfer";
import { supportsFlatten } from "@/grida-canvas/reducers/methods/flatten";
import grida from "@grida/schema";
import assert from "assert";
import { toast } from "sonner";
import { keyboardShortcutText } from "@/grida-canvas-hosted/playground/uxhost-shortcut-renderer";
import {
  applyVisualLayerStyle,
  parseVisualLayerStyle,
  readVisualLayerStyle,
  hasVisualLayerDecorations,
  VISUAL_LAYER_STYLE_CLIPBOARD_KEY,
} from "./style-clipboard";
import {
  canPasteTextMatchingDestinationStyle,
  pasteTextMatchingDestinationStyle,
} from "./paste-match-style";
import { pasteClipboardIntoActiveTextScene } from "./text-clipboard";

export interface ContextMenuAction {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

type ContextMenuActionType =
  | "copy"
  | "paste"
  | "pasteAndMatchTextStyle"
  | "copyLayerStyle"
  | "pasteLayerStyle"
  | "copyAsSVG"
  | "copyAsPNG"
  | "bringToFront"
  | "sendToBack"
  | "groupWithContainer"
  | "group"
  | "ungroup"
  | "autoLayout"
  | "flatten"
  | "planarize"
  | "groupMask"
  | "removeMask"
  | "toggleActive"
  | "zoomToFit"
  | "toggleLocked"
  | "delete";

export type ContextMenuActions = Record<
  ContextMenuActionType,
  ContextMenuAction
>;

export function useContextMenuActions(ids: string[]): ContextMenuActions {
  assert(Array.isArray(ids), "ids must be an array");
  const editor = useCurrentEditor();
  const backend = useBackendState();
  const { onpaste_external_event } = useDataTransferEventTarget();

  const { nodes, contentEditMode } = useEditorState(editor, (s) => {
    const map: Record<string, { type: grida.program.nodes.NodeType }> = {};
    ids.forEach((id) => {
      map[id] = { type: s.document.nodes[id].type };
    });
    return { nodes: map, contentEditMode: s.content_edit_mode };
  });

  const hasSelection = ids.length > 0;
  const isSingle = ids.length === 1;
  const singleId = isSingle ? ids[0]! : null;
  const isEditingText = contentEditMode?.type === "text";
  const selectedTextNodeId =
    singleId &&
    (nodes[singleId]?.type === "tspan" || nodes[singleId]?.type === "text")
      ? singleId
      : null;
  let hasActiveWasmTextEdit = false;
  try {
    hasActiveWasmTextEdit = editor.wasmScene?.textEditIsActive() ?? false;
  } catch {
    // A disposed renderer is not an active text destination.
  }
  const canGroup = backend === "canvas" && hasSelection;

  const canFlatten =
    backend === "canvas" &&
    hasSelection &&
    ids.every((id) => supportsFlatten(nodes[id]));

  const canUngroup =
    backend === "canvas" &&
    hasSelection &&
    ids.some(
      (id) => nodes[id].type === "group" || nodes[id].type === "boolean"
    );

  const canPlanarize =
    backend === "canvas" &&
    hasSelection &&
    ids.every((id) => nodes[id].type === "vector");

  const canGroupMask = canGroup;
  const canRemoveMask = isSingle && editor.isMask(ids[0]);

  const targetSingleOrSelection =
    ids.length === 1 ? (ids[0] as string) : "selection";

  const handlePaste = useCallback(async () => {
    const scene = editor.wasmScene;
    if (scene?.textEditIsActive()) {
      try {
        await pasteClipboardIntoActiveTextScene(scene);
      } catch {
        toast.error("Couldn't read text from the clipboard");
      }
      return;
    }
    await onpaste_external_event();
  }, [editor, onpaste_external_event]);

  return useMemo<ContextMenuActions>(
    () => ({
      copy: {
        label: "Copy",
        disabled: !hasSelection,
        onSelect: () =>
          editor.commands.copy(
            hasSelection && ids.length === 1 ? (ids[0] as string) : "selection"
          ),
      },
      paste: {
        label: "Paste",
        onSelect: handlePaste,
      },
      // See test/canvas-clipboard-paste-match-text-style.md.
      pasteAndMatchTextStyle: {
        label: "Paste and match style",
        disabled: !canPasteTextMatchingDestinationStyle({
          isEditingText,
          hasActiveSceneTextEdit: hasActiveWasmTextEdit,
          selectedTextNodeId,
        }),
        onSelect: () => {
          void window.navigator.clipboard.readText().then(
            (text) => {
              const scene = editor.wasmScene;
              if (
                pasteTextMatchingDestinationStyle(
                  scene,
                  text,
                  selectedTextNodeId
                    ? {
                        nodeId: selectedTextNodeId,
                        replaceText: (nodeId, value) =>
                          editor.commands.changeNodePropertyText(nodeId, value),
                      }
                    : undefined
                )
              ) {
                toast.success("Pasted and matched text style");
                return;
              }
              toast.error("Select a text layer before pasting");
            },
            () => toast.error("Couldn't read text from the clipboard")
          );
        },
      },
      // See test/canvas-clipboard-copy-paste-layer-style.md.
      copyLayerStyle: {
        label: "Copy layer style",
        disabled: !isSingle,
        onSelect: () => {
          try {
            const node = editor.state.document.nodes[
              ids[0] as string
            ] as unknown as Record<string, unknown> | undefined;
            if (!node) return;
            const style = readVisualLayerStyle(node);
            window.localStorage.setItem(
              VISUAL_LAYER_STYLE_CLIPBOARD_KEY,
              JSON.stringify(style)
            );
            if (hasVisualLayerDecorations(style)) {
              toast.success("Copied border, shadow, and glow style");
            } else {
              toast.info(
                "This layer has no border, shadow, or glow; pasting clears those decorations"
              );
            }
          } catch {
            toast.error("Couldn't copy layer style");
          }
        },
      },
      pasteLayerStyle: {
        label: "Paste layer style",
        disabled: !hasSelection,
        onSelect: () => {
          try {
            const raw = window.localStorage.getItem(
              VISUAL_LAYER_STYLE_CLIPBOARD_KEY
            );
            if (!raw) {
              toast.error("No layer style copied yet");
              return;
            }
            const style = parseVisualLayerStyle(raw);
            if (!style) {
              toast.error("Copied layer style is invalid");
              return;
            }
            const commands = editor.commands as unknown as Record<
              string,
              (...args: unknown[]) => unknown
            >;
            ids.forEach((id) => applyVisualLayerStyle(commands, id, style));
            toast.success("Pasted layer style");
          } catch {
            toast.error("Couldn't paste layer style");
          }
        },
      },
      copyAsSVG: {
        label: "Copy as SVG",
        disabled: backend !== "canvas" || !hasSelection,
        onSelect: () => {
          void editor.surface.a11yCopyAsSVG();
        },
      },
      copyAsPNG: {
        label: "Copy as PNG",
        shortcut: keyboardShortcutText("workbench.surface.edit.copy-as-png"),
        disabled: backend !== "canvas" || !hasSelection,
        onSelect: () => editor.surface.a11yCopyAsImage("png"),
      },
      bringToFront: {
        label: "Bring to front",
        shortcut: keyboardShortcutText("workbench.surface.view.move-to-front"),
        disabled: !hasSelection,
        onSelect: () => editor.surface.order("front"),
      },
      sendToBack: {
        label: "Send to back",
        shortcut: keyboardShortcutText("workbench.surface.view.move-to-back"),
        disabled: !hasSelection,
        onSelect: () => editor.surface.order("back"),
      },
      groupWithContainer: {
        label: "Group with Container",
        shortcut: keyboardShortcutText(
          "workbench.surface.object.group-with-container"
        ),
        disabled: !hasSelection,
        onSelect: () => editor.commands.contain(ids),
      },
      group: {
        label: "Group",
        shortcut: keyboardShortcutText("workbench.surface.object.group"),
        disabled: !canGroup,
        onSelect: () => editor.commands.group(ids),
      },
      ungroup: {
        label: "Ungroup",
        shortcut: keyboardShortcutText("workbench.surface.object.ungroup"),
        disabled: !canUngroup,
        onSelect: () => editor.surface.ungroup(ids),
      },
      autoLayout: {
        label: "Auto-Layout",
        shortcut: keyboardShortcutText("workbench.surface.object.auto-layout"),
        disabled: !hasSelection,
        onSelect: () => editor.commands.autoLayout(ids),
      },
      flatten: {
        label: "Flatten",
        shortcut: keyboardShortcutText("workbench.surface.object.flatten"),
        disabled: !canFlatten,
        onSelect: () =>
          editor.commands.flatten(
            hasSelection && ids.length === 1 ? (ids[0] as string) : "selection"
          ),
      },
      planarize: {
        label: "Planarize",
        disabled: !canPlanarize,
        onSelect: () => editor.commands.planarize(ids),
      },
      groupMask: {
        label: "Use as Mask",
        disabled: !canGroupMask,
        onSelect: () => editor.commands.groupMask(ids),
      },
      removeMask: {
        label: "Remove Mask",
        disabled: !canRemoveMask,
        onSelect: () => editor.removeMask(ids[0]),
      },
      toggleActive: {
        label: "Set Active/Inactive",
        shortcut: keyboardShortcutText(
          "workbench.surface.object.toggle-active"
        ),
        disabled: !hasSelection,
        onSelect: () => {
          ids.forEach((id) => editor.commands.toggleNodeActive(id));
        },
      },
      zoomToFit: {
        label: "Zoom to fit",
        shortcut: keyboardShortcutText("workbench.surface.view.zoom-to-fit"),
        disabled: !hasSelection,
        onSelect: () => editor.camera.fit(ids, { margin: 64, animate: true }),
      },
      toggleLocked: {
        label: "Lock/Unlock",
        shortcut: keyboardShortcutText(
          "workbench.surface.object.toggle-locked"
        ),
        disabled: !hasSelection,
        onSelect: () => {
          ids.forEach((id) => editor.commands.toggleNodeLocked(id));
        },
      },
      delete: {
        label: "Delete",
        shortcut: keyboardShortcutText("workbench.surface.edit.delete-node"),
        disabled: !hasSelection,
        onSelect: () => editor.commands.delete(ids),
      },
    }),
    [
      ids,
      editor,
      handlePaste,
      hasSelection,
      isEditingText,
      hasActiveWasmTextEdit,
      selectedTextNodeId,
      canFlatten,
      targetSingleOrSelection,
      backend,
    ]
  );
}
