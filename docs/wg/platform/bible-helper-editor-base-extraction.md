---
title: Bible Helper Editor Base Extraction Map
description: Concrete copy, replacement, and cutover checklist for using Grida canvas as the new offline editor base.
keywords:
  - grida
  - bible helper
  - editor
  - offline
  - extraction
doc_tasks:
  - enhance
format: md
---

# Goal

Use Grida canvas/editor core as the new offline base for Bible Helper, without Supabase/auth/tenant dependencies.

# Decision

Yes, the old editor base should eventually be deleted, but only after parity gates are passed.

# Copy Now (Must Have)

Copy these directories/files into the new Bible Helper editor workspace first:

- `editor/grida-canvas/**`
- `editor/grida-canvas-react/**`
- `editor/grida-canvas-utils/**`
- `editor/components/ui/**`
- `editor/components/ui-editor/**`
- `editor/components/lib/utils.ts`
- `editor/components/workbench/index.ts`
- `editor/app/ui.css`
- `editor/app/editor.css`
- `editor/postcss.config.mjs`
- `editor/tsconfig.json` (path alias + strict compiler settings)
- `editor/components.json` (shadcn aliases and icon library)

Package layer (workspace copy or equivalent dependency import):

- `packages/grida-canvas-schema` (`@grida/schema`)
- `packages/grida-format` (`@grida/format`)
- `packages/grida-canvas-io` (`@grida/io`)
- `packages/grida-cmath` (`@grida/cmath`)
- `packages/grida-canvas-cg` (`@grida/cg`)
- `packages/grida-canvas-color` (`@grida/color`)
- `packages/grida-history` (`@grida/history`)
- `packages/grida-tree` (`@grida/tree`)
- `packages/grida-canvas-vn` (`@grida/vn`)
- `packages/grida-svg` (`@grida/svg`)

Also keep the Windows-safe script in `packages/grida-format/package.json`:

- `flatc:clean` uses `node -e ... fs.rmSync(...)` (not `rm -rf`).

# Replace (Do Not Bring As-Is)

Do not directly reuse these app shell pieces:

- `editor/proxy.ts` (tenant/middleware path rewrites)
- `editor/app/(canvas)/layout.tsx` (platform provider + app-level coupling)
- any auth/workspace/home routes

Use a local standalone page entry instead:

- start from `editor/app/(canvas)/canvas/examples/minimal/page.tsx`
- remove high-coupling panels first (`Selection`, heavy sidecontrol dependencies)
- keep `StandaloneDocumentEditor + ViewportRoot + EditorSurface + StandaloneSceneContent`

Route host rule for local testing:

- use `http://localhost:<port>/...`
- avoid `127.0.0.1` with Grida tenant rewrite logic.

# Defer (Copy Later Only If Needed)

These are useful but should be delayed until the core is stable:

- `editor/scaffolds/sidecontrol/**` (large dependency fan-out)
- `editor/grida-canvas-react-starter-kit/**` toolbar/hierarchy modules
- `editor/grida-canvas-hosted/**` helpers
- theme/site/forms/global editor shells

# Bible Helper Tailoring Plan

## Phase 1 (Core Standalone)

- Add/open/edit canvas document offline.
- Add text and image nodes.
- Save/load with local storage + file import/export.

## Phase 2 (Bible UX)

- Add quick actions:
  - `Verse`
  - `Reference`
  - `Verse + Reference` preset block
- Add image behavior:
  - image as independent layer
  - image as text background mode

## Phase 3 (UI Parity + Cleanup)

- Reintroduce selected Grida UI controls/icons.
- Keep only controls needed by Bible Helper authoring flow.

# Cutover Criteria (Before Deleting Old Base)

Only delete the existing editor base after all are true:

1. New base works fully offline (airplane mode test).
2. Verse/reference authoring flow is complete.
3. Image layer + text-background image flow is complete.
4. Save/load/export/import works on real test files.
5. 7-day daily usage without blocker regressions.
6. Rollback is no longer needed.

# Final Migration Step

When criteria pass:

1. Freeze old editor base as read-only for one release.
2. Switch Bible Helper default editor to new base.
3. Remove old base code in the following release.
