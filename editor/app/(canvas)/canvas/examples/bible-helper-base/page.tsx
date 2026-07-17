"use client";

/**
 * Bible Helper canvas entry — CLIENT component so URL search params
 * are read at RUNTIME (via useSearchParams) rather than build time.
 *
 * Why client + hook: with `output: 'export'` (static export) the page
 * is generated once and served as static HTML. An async server
 * component reading `await searchParams` resolves params at build
 * time, which is always empty — every visit would see workspace="theme"
 * + room="default" regardless of the URL. The hook re-reads on each
 * navigation so ?workspace=stage, ?room=<uuid>, ?parentOrigin=... all
 * propagate correctly.
 *
 * Note: page-level `metadata` is a server-only API. The browser tab
 * title falls back to whatever (canvas)/layout.tsx declares — that's
 * fine for an embedded iframe whose title never shows anyway.
 */

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Editor from "../../editor";
import { validateRhemaParentOrigin } from "@/grida-canvas-hosted/playground/rhema-parent-origin";

function BibleHelperBaseInner() {
  const params = useSearchParams();
  const room = params.get("room");
  const scene = params.get("scene");
  const parentOrigin = params.get("parentOrigin");
  const workspace = params.get("workspace");
  // Transient host flag: the Bible-Helper crash-notification's "Restore"
  // button opens the editor with this set so the crash draft applies
  // immediately instead of prompting (the host banner IS the prompt).
  // Never persisted into stored editor URLs by the host.
  const restoreDraft = params.get("bhRestoreDraft");
  // Canonical native imports already carry the complete multi-scene document.
  // Their bundle save never needs per-scene compatibility SVG exports.
  const canonicalNativeDocument = params.get("nativeDocument") === "1";

  const roomId =
    typeof room === "string" && room.trim() ? room.trim() : "default";
  const initialSceneId =
    typeof scene === "string" && scene.trim() ? scene.trim() : undefined;

  // Workspace gate — "stage" boots the editor into the stage palette
  // (clock / countdown / scripture-preview components, separate save
  // channel). "slide" boots the slide-authoring mode (single-scene,
  // simplified chrome, saves as private slide themes via the
  // `bible-helper-slide-save` postMessage). Anything else (including
  // missing) falls back to the default theme workspace so existing
  // theme-editor URLs keep working.
  //
  // Uses a Record lookup instead of a nested ternary because Turbopack's
  // DCE pass aggressively tree-shakes literal-string ternary branches
  // when it can't prove they're reachable — observed dropping the
  // "slide" branch entirely from the compiled bundle.
  const workspaceMode: "stage" | "theme" | "slide" =
    workspace === "stage" ? "stage" : workspace === "slide" ? "slide" : "theme";

  // The Bible Helper opener stamps its origin onto the URL so we can use it
  // as the postMessage target instead of "*". Browser-hosted http(s) origins
  // retain their existing contract; a packaged custom scheme is accepted only
  // when it exactly matches this same-origin editor frame.
  const validatedParentOrigin = validateRhemaParentOrigin(
    parentOrigin,
    typeof window === "undefined" ? undefined : window.location.origin
  );

  // Filekey prefix is namespace-distinct per workspace so a single
  // operator can keep parallel theme + stage + slide documents in OPFS
  // without their scenes ever colliding. Record lookup (instead of a
  // nested ternary) for the same Turbopack-DCE reason as workspaceMode.
  const FILEKEY_PREFIXES: Record<"stage" | "theme" | "slide", string> = {
    stage: "rhema-stage-v1",
    slide: "rhema-slide-v1",
    theme: "rhema-base-v4",
  };
  const filekeyPrefix = FILEKEY_PREFIXES[workspaceMode];

  return (
    <main className="w-screen h-screen overflow-hidden">
      <Editor
        backend="canvas"
        room_id={roomId}
        initialSceneId={initialSceneId}
        parentOrigin={validatedParentOrigin}
        profile="bible-helper"
        workspace={workspaceMode}
        filekey={`${filekeyPrefix}-${roomId}`}
        restoreDraftOnBoot={restoreDraft === "1"}
        canonicalNativeDocument={canonicalNativeDocument}
      />
    </main>
  );
}

export default function BibleHelperBasePage() {
  // useSearchParams must be inside Suspense per Next.js App Router rules.
  return (
    <Suspense fallback={null}>
      <BibleHelperBaseInner />
    </Suspense>
  );
}
