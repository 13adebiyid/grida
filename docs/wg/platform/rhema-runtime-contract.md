# Rhema Runtime Contract

This document defines the minimal payload contract between the Rhema editor
theme and Bible Helper runtime rendering.

## Scene Userdata Keys

The active scene stores bindings in `scene.metadata.userdata`:

- `rhema_binding_scripture_node_id`: `string | null`
- `rhema_binding_reference_node_id`: `string | null`
- `rhema_reference_include_version`: `boolean`

## Export Payload

`Export Rhema JSON` writes:

```json
{
  "kind": "rhema-theme-runtime",
  "version": 1,
  "scene": {
    "id": "scene-id",
    "name": "Theme 1"
  },
  "bindings": {
    "scriptureNodeId": "node-id",
    "referenceNodeId": "node-id",
    "includeVersionInReference": true
  },
  "textLayers": [
    {
      "id": "node-id",
      "name": "Scripture",
      "text": "For God so loved the world...",
      "role": "scripture"
    }
  ]
}
```

## Runtime Apply Rules

Bible Helper runtime should:

1. Load `.grida` for layout/style/geometry.
2. Read bindings from scene userdata (or from exported Rhema JSON).
3. Inject verse content:
   - `scripture` into `scriptureNodeId`
   - `reference` into `referenceNodeId`
4. If `includeVersionInReference` is `true`, render reference as:
   - `<reference> (<version>)`
5. Keep all style/position values unchanged; only update text content.

## Overflow Policy

Current policy for scripture text overflow is `shrink-to-fit`.
