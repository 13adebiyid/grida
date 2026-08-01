---
id: TC-CANVAS-RESIZE-004
title: Rhema content resize remains inside the fixed stage
module: canvas
area: resize
tags: [rhema, stage, resize, selection-overlay, clipping]
status: untested
severity: critical
date: 2026-08-02
updated: 2026-08-02
automatable: false
covered_by:
  - editor/grida-canvas/reducers/__tests__/scale-rhema-stage-bounds.test.ts
---

## Behavior

The **Canvas 1920x1080** node is an immutable authoring host rather than slide
content. It cannot become a transform selection through the surface or Layers
panel. Resizing a child stops at the stage edges, preserving its anchor and
aspect-ratio rules so the blue selection overlay stays aligned with the actual
rendered object instead of describing clipped, off-stage geometry.

## Steps

1. Open a Rhema native slide containing an image and a text layer.
2. Click **Canvas 1920x1080** in the Layers panel and on its visible edge.
3. Expected: the stage does not become a movable or resizable selection.
4. Select the image and resize its east, west, north, and south edges toward
   and past the stage boundary.
5. Expected: the resize stops exactly at the boundary and the blue overlay is
   aligned to the image edge.
6. Repeat with a corner handle while preserving aspect ratio.
7. Expected: the tighter stage axis limits both dimensions and the overlay
   remains aligned.
8. Repeat with the text layer, save, close, and reopen the document.
9. Expected: no child geometry crosses the stage and all overlays remain
   aligned after reload.

## Notes

The automated coverage verifies the shared resize transform math for edge and
aspect-ratio cases. This case covers pointer gestures, hierarchy selection,
renderer clipping, and visual overlay alignment.
