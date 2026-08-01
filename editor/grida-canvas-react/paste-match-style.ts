export interface PlainTextPasteScene {
  textEditIsActive(): boolean;
  textEditPasteText(text: string): void;
  redraw(): void;
}

/** Insert plain text into the active text-edit run. The renderer assigns the
 * destination run's typography (family, size, and tracking) because no source
 * HTML or attributed-text style crosses this boundary. */
export function pasteTextMatchingDestinationStyle(
  scene: PlainTextPasteScene,
  text: string
): boolean {
  if (!text || !scene.textEditIsActive()) return false;
  scene.textEditPasteText(text);
  scene.redraw();
  return true;
}
