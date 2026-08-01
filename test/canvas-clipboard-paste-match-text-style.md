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
2. Enter text-edit mode in the destination and place the caret or select a text
   range.
3. Open the surface context menu and choose **Paste and match style**.
4. Expected: the clipboard wording is inserted or replaces the selected text.
5. Expected: the inserted text uses the destination run's font family, size,
   and tracking rather than the source styling.
6. Expected: the destination layer's fill, alignment, border, shadow, and glow
   are unchanged.
7. Save, close, and reopen the document.
8. Expected: the matched typography and preserved destination visuals remain
   unchanged after reload.

## Notes

The co-located automated test verifies that this command uses the plain-text
text-edit API and refuses to run outside active text editing. This case covers
the menu interaction, clipboard permission, caret/selection behavior, renderer
update, and persistence path.
