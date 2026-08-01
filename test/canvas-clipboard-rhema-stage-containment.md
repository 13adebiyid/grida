---
id: TC-CANVAS-CLIPBOARD-005
title: Pasted content remains inside the Rhema slide stage
module: canvas
area: clipboard
tags: [clipboard, paste, text, rhema, stage, containment]
status: untested
severity: critical
date: 2026-08-02
updated: 2026-08-02
automatable: false
covered_by:
  - editor/grida-canvas/reducers/__tests__/insert-rhema-stage.test.ts
  - editor/grida-canvas/utils/__tests__/insertion-targeting.test.ts
---

## Behavior

The fixed Rhema slide stage is the insertion boundary for every new layer.
External text, image, SVG, Markdown, Figma, and internal Grida paste routes
must resolve the same stage parent and place fitting content wholly inside it.
An oversized layer remains stage-parented and is centered for deterministic
clipping rather than becoming a scene-root layer.

## Steps

1. Open a Rhema native slide and deselect all content.
2. Copy a short plain-text phrase from another application.
3. Right-click near each edge and corner of the slide and choose **Paste**.
4. Expected: each new text layer appears in the Layers panel under **Canvas
   1920x1080**, uses a readable authoring size, and remains inside the stage.
5. Repeat with an image, SVG, Markdown, Figma selection, and an internally
   copied Grida layer.
6. Expected: every fitting layer is contained by the stage and no content
   appears as a scene-root sibling above **Canvas 1920x1080**.
7. Paste an object larger than the stage.
8. Expected: it remains a child of the stage and is centered for symmetric,
   intentional clipping.
9. Save, close, and reopen the document.
10. Expected: parenting and placement are unchanged.

## Notes

The automated coverage proves canonical stage resolution, legacy metadata
fallback, scene-root target repair, and insertion containment. This case covers
native clipboard APIs, pointer placement, layer-tree presentation, and reload.
