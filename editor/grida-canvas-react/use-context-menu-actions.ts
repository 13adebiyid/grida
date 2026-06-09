import { useCallback, useMemo } from "react";
import { useCurrentEditor, useEditorState } from "./use-editor";
import { useBackendState } from "./provider";
import { useDataTransferEventTarget } from "./use-data-transfer";
import { supportsFlatten } from "@/grida-canvas/reducers/methods/flatten";
import grida from "@grida/schema";
import assert from "assert";
import { toast } from "sonner";
import { keyboardShortcutText } from "@/grida-canvas-hosted/playground/uxhost-shortcut-renderer";

export interface ContextMenuAction {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

// ── Copy / Paste Layer Style (Bible Helper, Photoshop-like) ─────────────────
// A text node's typography + fills, copied into a same-origin localStorage
// "clipboard" so a style copied in ONE slide/document can be pasted onto a text
// layer in ANOTHER (each slide opens a fresh editor iframe, but localStorage is
// shared across them on the same origin). font_family is intentionally omitted
// from v1 — it routes through an async font-load/validation path, not a plain
// setter, so applying it blind risks silent failure.
const LAYER_STYLE_CLIPBOARD_KEY = "bh-layer-style-clipboard.v1";
const LAYER_STYLE_KEYS = [
  "fills",
  "font_size",
  "font_weight",
  "text_align",
  "text_align_vertical",
  "line_height",
  "letter_spacing",
  "word_spacing",
] as const;

function readLayerStyle(
  node: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of LAYER_STYLE_KEYS) {
    if (node[k] !== undefined) out[k] = node[k];
  }
  return out;
}

// Apply a copied style to one node. Each property is set independently and
// guarded — a non-text target (or an unsupported value) skips that property
// instead of aborting the whole paste.
function applyLayerStyle(
  editor: ReturnType<typeof useCurrentEditor>,
  id: string,
  style: Record<string, unknown>
): void {
  const c = editor.commands as unknown as Record<
    string,
    (...a: unknown[]) => void
  >;
  const set = (v: unknown) => ({ type: "set", value: v });
  const tryCall = (
    fn: ((...a: unknown[]) => void) | undefined,
    ...args: unknown[]
  ) => {
    try {
      fn?.(...args);
    } catch {
      /* property unsupported on this node — skip it */
    }
  };
  if (style.fills !== undefined)
    tryCall(c.changeNodePropertyFills, id, style.fills);
  if (style.font_size !== undefined)
    tryCall(c.changeTextNodeFontSize, id, set(style.font_size));
  if (style.font_weight !== undefined)
    tryCall(c.changeTextNodeFontWeight, id, style.font_weight);
  if (style.text_align !== undefined)
    tryCall(c.changeTextNodeTextAlign, id, style.text_align);
  if (style.text_align_vertical !== undefined)
    tryCall(c.changeTextNodeTextAlignVertical, id, style.text_align_vertical);
  if (style.line_height !== undefined)
    tryCall(c.changeTextNodeLineHeight, id, set(style.line_height));
  if (style.letter_spacing !== undefined)
    tryCall(c.changeTextNodeLetterSpacing, id, set(style.letter_spacing));
  if (style.word_spacing !== undefined)
    tryCall(c.changeTextNodeWordSpacing, id, set(style.word_spacing));
}

type ContextMenuActionType =
  | "copy"
  | "paste"
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

  const nodes = useEditorState(editor, (s) => {
    const map: Record<string, { type: grida.program.nodes.NodeType }> = {};
    ids.forEach((id) => {
      map[id] = { type: s.document.nodes[id].type };
    });
    return map;
  });

  const hasSelection = ids.length > 0;
  const isSingle = ids.length === 1;
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
    await onpaste_external_event();
  }, [onpaste_external_event]);

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
      copyLayerStyle: {
        label: "Copy layer style",
        disabled: !isSingle,
        onSelect: () => {
          try {
            const node = editor.state.document.nodes[ids[0] as string] as
              | Record<string, unknown>
              | undefined;
            if (!node) return;
            const style = readLayerStyle(node);
            window.localStorage.setItem(
              LAYER_STYLE_CLIPBOARD_KEY,
              JSON.stringify(style)
            );
            toast.success("Copied layer style");
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
            const raw = window.localStorage.getItem(LAYER_STYLE_CLIPBOARD_KEY);
            if (!raw) {
              toast.error("No layer style copied yet");
              return;
            }
            const style = JSON.parse(raw) as Record<string, unknown>;
            ids.forEach((id) => applyLayerStyle(editor, id, style));
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
      canFlatten,
      targetSingleOrSelection,
      backend,
    ]
  );
}
