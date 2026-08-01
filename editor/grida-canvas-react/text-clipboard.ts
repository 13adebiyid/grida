export interface TextClipboardScene {
  textEditIsActive(): boolean;
  textEditPasteHtml(html: string): void;
  textEditPasteText(text: string): void;
  redraw(): void;
}

interface ClipboardReader {
  read(): Promise<ClipboardItems>;
  readText(): Promise<string>;
}

/** Route a normal Paste command into the canonical active text-edit session.
 * Returns false when there is no active session, allowing the caller to use
 * the document/layer paste pipeline instead.
 */
export async function pasteClipboardIntoActiveTextScene(
  scene: TextClipboardScene,
  clipboard: ClipboardReader = navigator.clipboard
): Promise<boolean> {
  if (!scene.textEditIsActive()) return false;

  try {
    const items = await clipboard.read();
    for (const item of items) {
      if (item.types.includes("text/html")) {
        const blob = await item.getType("text/html");
        scene.textEditPasteHtml(await blob.text());
        scene.redraw();
        return true;
      }
      if (item.types.includes("text/plain")) {
        const blob = await item.getType("text/plain");
        scene.textEditPasteText(await blob.text());
        scene.redraw();
        return true;
      }
    }
  } catch {
    const text = await clipboard.readText();
    scene.textEditPasteText(text);
    scene.redraw();
    return true;
  }

  return true;
}
