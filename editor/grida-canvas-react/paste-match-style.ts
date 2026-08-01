export interface PlainTextPasteScene {
  textEditIsActive(): boolean;
  textEditPasteText(text: string): void;
  redraw(): void;
}

export type SelectedTextDestination = {
  nodeId: string;
  replaceText(nodeId: string, text: string): void;
};

export function canPasteTextMatchingDestinationStyle(args: {
  isEditingText: boolean;
  hasActiveSceneTextEdit: boolean;
  selectedTextNodeId: string | null;
}): boolean {
  return (
    args.isEditingText ||
    args.hasActiveSceneTextEdit ||
    args.selectedTextNodeId !== null
  );
}

/** Insert plain text into the active text-edit run. The renderer assigns the
 * destination run's typography (family, size, and tracking) because no source
 * HTML or attributed-text style crosses this boundary. */
export function pasteTextMatchingDestinationStyle(
  scene: PlainTextPasteScene | null,
  text: string,
  selected?: SelectedTextDestination
): boolean {
  if (!text) return false;
  if (scene?.textEditIsActive()) {
    scene.textEditPasteText(text);
    scene.redraw();
    return true;
  }
  if (!selected) return false;
  selected.replaceText(selected.nodeId, text);
  return true;
}
