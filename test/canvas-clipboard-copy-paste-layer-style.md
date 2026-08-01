---
id: TC-CANVAS-CLIPBOARD-004
title: Copy and paste visual layer decorations
module: canvas
area: clipboard
tags: [context-menu, style, stroke, shadow]
status: untested
severity: high
date: 2026-08-01
updated: 2026-08-01
automatable: false
covered_by:
  - editor/grida-canvas-react/style-clipboard.test.ts
---

## Behavior

Copy and paste layer style transfers only outer decorations: borders and
strokes, dash and endpoint settings, per-side border widths, shadows, and glows
(represented by zero-offset shadows). It does not replace fills or text
typography. Copying a plain layer is meaningful: pasting that style clears
those decorations from the destination.

## Steps

1. Create a source object with a visible border, dash pattern, drop shadow, and
   glow. Give it a different fill from a destination object.
2. Select the source, open the surface context menu, and choose **Copy layer
   style**.
3. Expected: feedback names the copied border, shadow, and glow decorations.
4. Select the destination, open the surface context menu, and choose **Paste
   layer style**.
5. Expected: the destination receives the source border/stroke, dash,
   shadow, and glow settings while keeping its original fill and any text
   typography.
6. Copy layer style from a third object with no border, shadow, or glow.
7. Expected: feedback explains that the source has no transferable decoration
   and that pasting it will clear decorations.
8. Paste it onto the decorated destination.
9. Expected: the destination's border, shadow, and glow are cleared while its
   fill and text typography remain unchanged.
10. Save, close, and reopen the document.
11. Expected: the resulting visual style remains unchanged after reload.

## Notes

The co-located automated test verifies clipboard-field ownership, explicit
clearing, and the exact command wiring for stroke markers, per-side borders,
shadows, and glows. This case covers the menu interaction, renderer update,
and document persistence path.
