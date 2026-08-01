---
id: TC-CANVAS-CLIPBOARD-003
title: Paste text content using the destination style
module: canvas
area: clipboard
tags: [text, context-menu, style]
status: untested
severity: high
date: 2026-08-01
updated: 2026-08-01
automatable: false
covered_by:
  - editor/grida-canvas-react/paste-match-style.test.ts
---

## Behavior

Paste and match style inserts only the clipboard's plain text content into the
active destination text run. It intentionally discards source HTML and rich
text styling, so the inserted characters inherit the new location's font
family, font size, and tracking. Outer layer decorations are never modified.

## Steps

1. Copy richly styled text from a source whose font family, size, and tracking
   visibly differ from the destination text layer.
2. Select the destination text layer without entering text-edit mode.
3. Open the surface context menu.
4. Expected: **Paste and match style** is enabled. Choose it.
5. Expected: the clipboard wording replaces the layer's text while the layer's
   font family, size, tracking, fill, alignment, border, shadow, and glow remain
   unchanged.
6. Undo, enter text-edit mode, and place the caret or select a text range.
7. Choose **Paste and match style** again.
8. Expected: the clipboard wording is inserted or replaces the selected text.
9. Expected: the inserted text uses the destination run's font family, size,
   and tracking rather than the source styling.
10. Expected: the destination layer's fill, alignment, border, shadow, and glow
    are unchanged.
11. Save, close, and reopen the document.
12. Expected: the matched typography and preserved destination visuals remain
    unchanged after reload.

## Notes

The co-located automated test verifies that this command uses the plain-text
text-edit API for an active caret/range and the canonical text property for a
selected text layer. It also verifies the menu enablement contract. This case
covers clipboard permission, renderer update, and persistence.
