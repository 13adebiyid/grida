"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { SidebarRoot } from "@/components/sidebar";
import {
  Selection,
  Zoom,
} from "@/scaffolds/sidecontrol/sidecontrol-node-selection";
import { DocumentProperties } from "@/scaffolds/sidecontrol/sidecontrol-document-properties";
import { DocumentHierarchy } from "@/grida-canvas-react-starter-kit/starterkit-hierarchy";
import {
  SceneThumbnailCache,
  SceneThumbnailContext,
  resolveRhemaStageNodeId,
  type SceneThumbnailContextValue,
} from "@/grida-canvas-react-starter-kit/starterkit-hierarchy/scene-thumbnail-cache";
import {
  StandaloneDocumentEditor,
  StandaloneSceneContent,
  ViewportRoot,
  EditorSurface,
  AutoInitialFitTransformer,
  StandaloneSceneBackground,
  UserCustomTemplatesProvider,
  type UserCustomTemplatesProps,
  useEditorState,
  useCurrentEditor,
  useEditor,
} from "@/grida-canvas-react";
import {
  useContentEditModeMinimalState,
  useCurrentSceneState,
  useToolState,
} from "@/grida-canvas-react/provider";
import { GridaLogo } from "@/components/grida-logo";
import { DevtoolsPanel } from "@/grida-canvas-react/devtools";
import {
  FontFamilyListProvider,
  LocalFontFamiliesProvider,
} from "@/scaffolds/sidecontrol/controls/font-family";
import {
  BIBLE_HELPER_LIST_SYSTEM_FONTS_REQUEST,
  BIBLE_HELPER_LIST_SYSTEM_FONTS_RESULT,
  buildLocalWebfontItems,
} from "./bible-helper-local-fonts";
import {
  PlusIcon,
  Cross1Icon,
  InfoCircledIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  FloatingWindowHost,
  FloatingWindowBounds,
  FloatingWindowRoot,
  FloatingWindowTitleBar,
  FloatingWindowBody,
  FloatingWindowClose,
  FloatingWindowTrigger,
  useFloatingWindowControls,
} from "@/components/floating-window";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Dialog as DialogPrimitive } from "radix-ui";
import { v4 } from "uuid";
import { HelpFab } from "@/scaffolds/globals/editor-help-fab";
import { Badge } from "@/components/ui/badge";
import { PlaygroundToolbar } from "./uxhost-toolbar";
import {
  Tabs,
  SidebarTabsContent,
  SidebarTabsList,
  SidebarTabsTrigger,
} from "@/components/ui-editor/sidebar-tabs";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { useEditorHotKeys } from "@/grida-canvas-react/viewport/hotkeys";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import ErrorBoundary from "./error-boundary";
import { uikbdk, M } from "@/grida-canvas/keybinding";
import { KeyCode } from "@/grida-canvas/keycode";
import { EditorSurfaceDropzone } from "@/grida-canvas-react/viewport/surface-dropzone";
import { EditorSurfaceContextMenu } from "@/grida-canvas-react/viewport/surface-context-menu";
import { EditorSurfaceClipboardSyncProvider } from "@/grida-canvas-react/viewport/surface";
import BrushToolbar from "@/grida-canvas-react-starter-kit/starterkit-toolbar/brush-toolbar";
import ArtboardsList from "@/grida-canvas-react-starter-kit/starterkit-artboard-list";
import { ToolbarPosition } from "@/grida-canvas-react-starter-kit/starterkit-toolbar";
import {
  PreviewButton,
  PreviewProvider,
} from "@/grida-canvas-react-starter-kit/starterkit-preview";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { DarwinSidebarHeaderDragArea } from "../../host/desktop";
import { editor } from "@/grida-canvas";
// Alias for scopes where a `useCurrentEditor()` instance shadows `editor`.
import { editor as editorNamespace } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import { ExternalAssetUrlProvider } from "@/grida-canvas-react-renderer-dom/nodes/external-asset-url";
import { AnimationSampleProvider } from "@/grida-canvas-react-renderer-dom/nodes/animation-sample";
import {
  NativeAnimationInspector,
  useNativeAnimationPreview,
} from "./native-animation-inspector";
import { SceneThumbnailRenderer } from "./scene-thumbnail-renderer";
import useDisableSwipeBack from "@/grida-canvas-react/viewport/hooks/use-disable-browser-swipe-back";
import { WindowGlobalCurrentEditorProvider } from "@/grida-canvas-react/devtools/global-api-host";
import { EditorSyncPlugin } from "@/grida-canvas/plugins/sync";
import { Editor } from "@/grida-canvas/editor";
import { PlayerAvatar } from "@/components/multiplayer/avatar";
import colors, {
  neutral_colors,
  randomcolorname,
} from "@/theme/tailwindcolors";
import { PathToolbar } from "@/grida-canvas-react-starter-kit/starterkit-toolbar/path-toolbar";
import { FullscreenLoadingOverlay } from "@/grida-canvas-react-starter-kit/starterkit-loading/loading";
import { CursorChat } from "@/components/multiplayer/cursor-chat";
import { distro } from "../distro";
import { WithSize } from "@/grida-canvas-react/viewport/size";
import { useDPR } from "@/grida-canvas-react/viewport/hooks/use-dpr";
import { AgentPanel } from "@/grida-canvas-hosted/ai/scaffold";
import { AgentChatProvider } from "@/grida-canvas-hosted/ai/scaffold/chat-provider";
import { StarterKitOrgIdProvider } from "@/grida-canvas-react-starter-kit/starterkit-host/org-id-provider";
import { PlaygroundMenuContent } from "./uxhost-menu";
import { Library } from "../library/library";
import { io } from "@grida/io";
import grida from "@grida/schema";
import kolor from "@grida/color";
import cg from "@grida/cg";
import cmath from "@grida/cmath";
import { saveAs } from "file-saver";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import {
  buildRhemaThemeRuntimeJson,
  extractBackdropImagesForSeed,
  getRhemaSceneBindings,
  materializeRhemaThemeDocument,
  stripTextFromSvg,
  RHEMA_BUNDLE_NAME_KEY,
  RHEMA_VISIBILITY_RULE_KEY,
  RHEMA_WORKSPACE_KEY,
  RHEMA_CLOCK_BINDING_KEY,
  RHEMA_NEXT_LAYOUT_BINDING_KEY,
  RHEMA_COMPONENT_KIND_KEY,
  type RhemaThemeBundleRuntimeJson,
  type RhemaThemeRuntimeJson,
  type RhemaVisibilityRule,
  type RhemaVisibilityCondition,
  type RhemaWorkspace,
} from "./rhema-contract";
import {
  RHEMA_BACKGROUND_VIDEO_KEY,
  applyBgVideoPoster,
  findBgVideoPosterIdsInScene,
  hideBgVideoPostersDuring,
  readPosterSourceBlobKey,
  requestBgVideoPosterFromHost,
} from "./rhema-bg-video-poster";
import {
  buildRhemaSaveDocumentPayload,
  serializeRhemaEditorSnapshot,
} from "./rhema-save-document";
import {
  fetchVerifiedExternalAsset,
  requestExternalAssetLocations,
} from "./rhema-external-assets";
import { STAGE_COMPONENTS } from "./stage-components";
import { StageComponentsToolbar } from "./stage-toolbar";
import { STAGE_TEMPLATES } from "./stage-templates";

const RHEMA_SCENE_BACKGROUND = kolor.colorformats.RGBA32F.fromHEX("#00000000");
const RHEMA_STAGE_NAME = "Canvas 1920x1080";
const RHEMA_STAGE_WIDTH = 1920;
const RHEMA_STAGE_HEIGHT = 1080;
const RHEMA_SERVICE_REFERENCE_KEY = "rhema_service_reference";
const RHEMA_SERVICE_REFERENCE_NODE_KEY = "rhema_service_reference_node_id";
/**
 * Resolve the basePath at which this editor is being served. In Grida's
 * own dev server the editor lives at "/" so basePath is empty. In the
 * Bible Helper bundled deployment it lives at "/editor" (set via
 * next.config.ts `basePath: "/editor"` under STATIC_EXPORT=1).
 * String-literal asset references like RHEMA_SERVICE_REFERENCE_IMAGES
 * below don't get Next.js's automatic basePath prefixing, so we compute
 * it from window.location at module load time.
 */
function detectEditorBasePath(): string {
  if (typeof window === "undefined") return "";
  // pathname is e.g. "/editor/canvas/examples/bible-helper-base/index.html"
  // or in dev "/canvas/examples/bible-helper-base"
  const m = window.location.pathname.match(/^(\/[^/]+)\/canvas\//);
  return m ? m[1] : "";
}
const EDITOR_BASE_PATH = detectEditorBasePath();
const RHEMA_SERVICE_REFERENCE_IMAGES = {
  preacher: `${EDITOR_BASE_PATH}/images/preacher-placeholder.jpg`,
  singer: `${EDITOR_BASE_PATH}/images/lyrics-placeholder.jpg`,
} as const;
const BIBLE_HELPER_THEME_SAVE_MESSAGE_TYPE = "bible-helper-theme-save";
const BIBLE_HELPER_THEME_BUNDLE_SAVE_MESSAGE_TYPE =
  "bible-helper-theme-bundle-save";
const BIBLE_HELPER_STAGE_BUNDLE_SAVE_MESSAGE_TYPE =
  "bible-helper-stage-bundle-save";
// Slide-authoring mode posts under its own message type so BH can
// route the payload into the private-slide-theme path (close-on-save,
// upserts by privateOwnerSlideId) instead of the public theme registry.
// Payload shape is identical to theme-save — the BH-side parser is
// the same, only the routing differs.
const BIBLE_HELPER_SLIDE_SAVE_MESSAGE_TYPE = "bible-helper-slide-save";
// Slide-bundle save — multi-scene slide-mode document. Each scene in
// the bundle becomes a slide in BH's library entry; together they
// form a "slide deck" / "show" the operator can Send / advance through
// like a lyric song. Distinct from the theme-bundle channel because
// it routes payload to the LIBRARY (slides), not to the theme registry.
const BIBLE_HELPER_SLIDE_BUNDLE_SAVE_MESSAGE_TYPE =
  "bible-helper-slide-bundle-save";
// Editor → host: the document's unsaved-edits state. The host uses it to
// confirm-before-discard when the operator closes the editor with unsaved work.
const BIBLE_HELPER_EDITOR_DIRTY_MESSAGE_TYPE = "bible-helper-editor-dirty";
// Host → editor: the operator confirmed "discard" on close, so drop the
// crash-restore draft (discarded edits aren't offered to restore on reopen).
const BIBLE_HELPER_DISCARD_DRAFT_MESSAGE_TYPE =
  "bible-helper-editor-discard-draft";
// Editor → host: this room has NO OPFS document yet (a builtin/default theme
// authored in BH code, or a freshly-cloned private theme) — request the stored
// theme JSON so the editor can materialize a document instead of opening a
// blank canvas. Host replies with BIBLE_HELPER_SEED_RESULT_MESSAGE_TYPE.
const BIBLE_HELPER_SEED_REQUEST_MESSAGE_TYPE = "bible-helper-seed-request";
const BIBLE_HELPER_SEED_RESULT_MESSAGE_TYPE = "bible-helper-seed-result";
// Editor ⇄ host: SONG-slide word refresh. The slide's words (lyric lines)
// live in the HOST — the canvas document's designated text node is only a
// working copy for editing. On every document (re)load the editor asks the
// host for the room's current words and overwrites the bound node's text
// (programmatic — no dirty flag, no draft), so an interim Quick-edit in the
// host can never leave the canvas showing stale words. Host replies
// { requestId, text: string | null } — null means "not a song slide /
// no words", a no-op.
const BIBLE_HELPER_LYRIC_CONTENT_REQUEST_MESSAGE_TYPE =
  "bible-helper-lyric-content-request";
const BIBLE_HELPER_LYRIC_CONTENT_RESULT_MESSAGE_TYPE =
  "bible-helper-lyric-content-result";

/**
 * Ask the Bible Helper host for the stored theme payload for a room whose
 * OPFS document is empty, so the editor can seed a document from it (the
 * "opens a blank canvas" fix). Mirrors the font-list request/reply handshake:
 * strict origin + source (must be window.parent) validation, a correlation
 * requestId, and a bounded timeout so a non-responding host falls through to
 * the empty document rather than hanging the load.
 */
export interface RhemaSeedDocument {
  snapshotJson: string;
  archiveBytes: ArrayBuffer;
}

export interface RhemaSeedResult {
  theme: RhemaThemeRuntimeJson;
  /** Pipeline-v2 (BH plan r3 section 5): the editor's own document as stored
   *  by the LAST save — present only when BH loaded BOTH blobs. */
  document: RhemaSeedDocument | null;
}

function parseSeedDocument(value: unknown): RhemaSeedDocument | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }
  const o = value as Record<string, unknown>;
  if (
    o.archiveBytes instanceof ArrayBuffer &&
    o.archiveBytes.byteLength > 0 &&
    typeof o.snapshotJson === "string" &&
    o.snapshotJson.trim()
  ) {
    return { archiveBytes: o.archiveBytes, snapshotJson: o.snapshotJson };
  }
  return null;
}

function requestRhemaThemeSeed(
  parentOrigin: string,
  room: string,
  workspace: RhemaWorkspace,
  timeoutMs = 5000
): Promise<RhemaSeedResult | null> {
  if (typeof window === "undefined" || window.parent === window) {
    return Promise.resolve(null);
  }
  const requestId = `seed-${v4()}`;
  return new Promise<RhemaSeedResult | null>((resolve) => {
    let settled = false;
    const finish = (value: RhemaSeedResult | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== parentOrigin || e.source !== window.parent) return;
      const d = e.data as {
        type?: unknown;
        payload?: {
          requestId?: unknown;
          ok?: unknown;
          theme?: unknown;
          document?: unknown;
        };
      } | null;
      if (!d || d.type !== BIBLE_HELPER_SEED_RESULT_MESSAGE_TYPE) return;
      const p = d.payload ?? {};
      if (p.requestId !== requestId) return;
      const theme =
        p.ok === true && p.theme && typeof p.theme === "object"
          ? (p.theme as RhemaThemeRuntimeJson)
          : null;
      finish(theme ? { theme, document: parseSeedDocument(p.document) } : null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      {
        type: BIBLE_HELPER_SEED_REQUEST_MESSAGE_TYPE,
        payload: { requestId, room, workspace },
      },
      parentOrigin
    );
  });
}

/**
 * Pipeline-v2 (BH plan r3 section 3): the editor's own persisted document,
 * attached to save payloads so BH stores it as the source of truth.
 * Mirrors the OPFS persistence formats exactly: the archive zip carries the
 * FBS document + image bytes; the JSON snapshot alone preserves scene
 * userdata (the FBS format has no metadata table). Returns null on ANY
 * failure — a save must never fail because archiving failed.
 */
function buildSaveDocumentPayload(
  instance: Editor
): { archiveBytes: ArrayBuffer; snapshotJson: string } | null {
  try {
    const dir = instance.archivedir();
    return buildRhemaSaveDocumentPayload(dir);
  } catch (err) {
    console.warn("[bh-save] document attach skipped:", err);
    return null;
  }
}

function isRhemaStageCandidate(
  node: grida.program.nodes.Node | undefined
): node is grida.program.nodes.ContainerNode {
  if (!node || node.type !== "container") return false;
  return (
    node.name === RHEMA_STAGE_NAME ||
    (typeof node.layout_target_width === "number" &&
      typeof node.layout_target_height === "number" &&
      node.layout_target_width >= 1280 &&
      node.layout_target_height >= 720)
  );
}

function createRhemaStagePrototype(): grida.program.nodes.ContainerNodePrototype {
  return {
    type: "container",
    name: RHEMA_STAGE_NAME,
    children: [],
    layout_positioning: "absolute",
    layout_inset_left: 0,
    layout_inset_top: 0,
    layout_target_width: RHEMA_STAGE_WIDTH,
    layout_target_height: RHEMA_STAGE_HEIGHT,
    clips_content: true,
    fill: {
      type: "solid",
      color: RHEMA_SCENE_BACKGROUND,
      active: true,
    },
    stroke_width: 1,
    stroke_align: "inside",
  };
}

/**
 * Generates a filesystem-safe key from a URL path.
 * Used to create deterministic OPFS keys for examples/embedded canvases.
 * Never returns an empty string - falls back to "root" or a hash of src.
 */
function generateFileKeyFromSrc(src: string): string {
  try {
    const url = new URL(src, window.location.origin);
    // Use pathname + search params to create a unique key
    const path = url.pathname + url.search;
    // Sanitize: replace slashes and special chars with hyphens, remove leading/trailing
    const sanitized = path
      .replace(/^\/+|\/+$/g, "") // Remove leading/trailing slashes
      .replace(/[^a-zA-Z0-9._-]/g, "-") // Replace non-safe chars with hyphens
      .replace(/-+/g, "-") // Collapse multiple hyphens
      .toLowerCase()
      .slice(0, 100); // Limit length for filesystem safety

    // If sanitized result is empty, fall back to hash of src
    return sanitized || `root-${editor.fnv1a32(src)}`;
  } catch {
    // Fallback: simple sanitization if URL parsing fails
    const sanitized = src
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase()
      .slice(0, 100);

    // If sanitized result is empty, fall back to hash of src
    return sanitized || `root-${editor.fnv1a32(src)}`;
  }
}

/**
 * Hook for accessing the playground OPFS handle.
 * Returns null if OPFS is not supported or handle creation fails.
 */
function usePlaygroundOPFS(filekey: string): io.opfs.Handle | null {
  return useMemo(() => {
    if (!io.opfs.Handle.isSupported()) {
      return null;
    }
    try {
      // Defensive check: ensure filekey is never empty
      const safeFilekey = filekey || "root";
      return new io.opfs.Handle({
        directory: ["playground", safeFilekey],
      });
    } catch (error) {
      console.error("Failed to create OPFS handle:", error);
      return null;
    }
  }, [filekey]);
}

function usePlaygroundDirtyFlag(
  instance: Editor,
  enabled: boolean,
  suppressRef?: React.MutableRefObject<number>
) {
  const [dirty, setDirty] = useState(false);

  const markSaved = useCallback(() => {
    setDirty(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Avoid extra subscriptions/overhead in demo contexts (e.g. /home embed).
      setDirty(false);
      return;
    }

    // Start clean for the current session.
    setDirty(false);

    const unsubscribe = instance.doc.subscribeWithSelector(
      (state) => state.document,
      (_store, _next, _prev, action) => {
        // Reset means "loaded/initialized", not a user edit.
        if (action?.type === "document/reset") {
          setDirty(false);
          return;
        }
        // Programmatic seed reconstruction is not an operator edit — an
        // untouched seeded session must not trigger confirm-before-discard.
        if (suppressRef && suppressRef.current > 0) return;
        setDirty(true);
      }
    );

    return unsubscribe;
  }, [enabled, instance, suppressRef]);

  return { dirty, markSaved };
}

// Custom hook for managing UI layout state
function useUILayout() {
  const [uiVariant, setUIVariant] = useState<distro.ui.UILayoutVariant>("full");
  const [lastVisibleVariant, setLastVisibleVariant] = useState<
    "full" | "minimal"
  >("full");
  const [rightSidebarTab, setRightSidebarTab] = useState<"inspect" | "agent">(
    "inspect"
  );

  const ui = useMemo(() => distro.ui.LAYOUT_VARIANTS[uiVariant], [uiVariant]);

  const toggleVisibility = useCallback(() => {
    setUIVariant((current) => {
      if (current === "hidden") {
        return lastVisibleVariant; // Return to last visible state
      }
      setLastVisibleVariant(current as "full" | "minimal"); // Remember current state
      return "hidden";
    });
  }, [lastVisibleVariant]);

  const toggleMinimal = useCallback(() => {
    setUIVariant((current) => {
      if (current === "hidden") {
        return "full"; // Don't toggle if hidden
      }
      const newVariant = current === "full" ? "minimal" : "full";
      setLastVisibleVariant(newVariant);
      return newVariant;
    });
  }, []);

  return {
    ui,
    uiVariant,
    rightSidebarTab,
    toggleVisibility,
    toggleMinimal,
    setRightSidebarTab,
  };
}

// Get or create a persistent cursor ID for this browser tab
const get_or_create_demo_session_cursor_id = (): string => {
  const storageKey = `grida-canvas-playground-current-session-cursor-id`;

  // Try to get existing cursor ID from session storage
  if (typeof window !== "undefined" && window.sessionStorage) {
    const existingId = window.sessionStorage.getItem(storageKey);
    if (existingId) {
      return existingId;
    }
  }

  // Generate new cursor ID if none exists
  const newId = `cursor-${v4()}`;

  // Store it in session storage for persistence across refreshes
  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.setItem(storageKey, newId);
  }

  return newId;
};

function useSyncMultiplayerCursors(editor: Editor, room_id?: string) {
  const pluginRef = useRef<EditorSyncPlugin | null>(null);

  useEffect(() => {
    if (!room_id) return;

    const cursorId = get_or_create_demo_session_cursor_id();

    if (!pluginRef.current) {
      pluginRef.current = new EditorSyncPlugin(editor, room_id, {
        cursor_id: cursorId,
        palette: colors[randomcolorname({ exclude: neutral_colors })],
      });
    }

    return () => {
      if (pluginRef.current) {
        pluginRef.current.destroy();
        pluginRef.current = null;
      }
    };
  }, [editor, room_id]);
}

export type CanvasPlaygroundProps = {
  src?: string;
  document?: editor.state.IEditorStateInit;
  room_id?: string;
  initialSceneId?: string;
  backend?: "dom" | "canvas";
  /**
   * OPFS file key. Determines which OPFS directory to use for persistence.
   * - Defaults to "current" for the main editor
   * - Examples/embeds should provide a unique key (or it will be auto-generated from `src`)
   *
   * @example
   * ```tsx
   * <PlaygroundCanvas filekey="my-project" />
   * <PlaygroundCanvas src="/examples/demo.grida" /> // auto-generates key from src
   * ```
   */
  filekey?: string;
  /**
   * Opt-in. When enabled, warn on navigation/close if there are unsaved changes.
   *
   * IMPORTANT: `playground` is also used in demo contexts (e.g. /home embed),
   * so this is intentionally off by default.
   */
  warnOnUnsavedChanges?: boolean;
  /**
   * Verified organization id from the host's workspace context. Threaded
   * to AI seam server actions (e.g. image upscale / remove-background) via
   * `<StarterKitOrgIdProvider />` (GRIDA-SEC-003). Pass `null`/`undefined`
   * for workspace-less playgrounds; AI tools will surface a "sign in"
   * message instead of erroring.
   */
  organizationId?: number | null;
  /**
   * Route-level UI profile for controlled stripping.
   * - default: full Grida playground behavior
   * - bible-helper: disables non-essential overlays/surfaces while preserving core editor UI
   */
  profile?: "default" | "bible-helper";
  /**
   * Validated Bible Helper opener origin (e.g. "http://localhost:5173").
   * When set, `saveThemeToBibleHelper` uses it as the postMessage target
   * origin instead of the wildcard "*". When unset, the save action fails
   * closed and shows a toast instead of broadcasting the payload.
   */
  parentOrigin?: string;
  /**
   * Workspace mode for bible-helper profile. "stage" forces every
   * new scene's userdata to workspace="stage" and routes Save through
   * the stage-bundle postMessage channel. "slide" enables single-scene
   * slide-authoring mode — simplified chrome (no scene list, no
   * visibility rules, no bundle naming), saves via the
   * `bible-helper-slide-save` channel. Default "theme" preserves the
   * original theme-editor behavior.
   */
  workspace?: "theme" | "stage" | "slide";
  /**
   * Bible-helper crash-recovery: when true (set via the host banner's
   * "Restore" action → `?bhRestoreDraft=1`), an existing crash draft is
   * applied on boot WITHOUT the "Restore unsaved changes?" prompt — the
   * host-side notification already was the prompt. No draft → no-op.
   */
  restoreDraftOnBoot?: boolean;
} & Partial<UserCustomTemplatesProps>;

export default function CanvasPlayground({
  document = distro.playground.EMPTY_DOCUMENT,
  backend = "canvas",
  templates,
  src,
  room_id,
  initialSceneId,
  filekey,
  warnOnUnsavedChanges = false,
  organizationId,
  profile = "default",
  parentOrigin,
  workspace = "theme",
  restoreDraftOnBoot = false,
}: CanvasPlaygroundProps) {
  // Determine filekey: explicit prop > auto-generated from src > default "current"
  const resolvedFilekey = useMemo(() => {
    if (filekey) return filekey;
    if (src) return generateFileKeyFromSrc(src);
    return "current";
  }, [filekey, src]);

  const instance = useEditor(document, backend);
  useDisableSwipeBack();
  useSyncMultiplayerCursors(
    instance,
    profile === "bible-helper" ? undefined : room_id
  );
  const fonts = useEditorState(instance, (state) => state.webfontlist.items);
  // Bible Helper: the operator's INSTALLED fonts, fetched from the host and
  // merged into the webfont registry so they appear in the picker AND load
  // through the existing pipeline (getFontItem → fetch(files[v]) → addFont).
  const localFontItemsRef = useRef<ReturnType<typeof buildLocalWebfontItems>>(
    []
  );
  const [localFontFamilies, setLocalFontFamilies] = useState<Set<string>>(
    () => new Set()
  );
  const opfs = usePlaygroundOPFS(resolvedFilekey);
  // Guards the crash-restore draft and the dirty flag against PROGRAMMATIC
  // document mutations — the seed hook's backdrop reconstruction AND the
  // rhema boot normalizers (scene background / stage geometry / userdata
  // stamps). None of those are operator edits: unsuppressed, every open
  // marked the session dirty at boot AND overwrote a surviving crash draft
  // ~1.2s after mount with the freshly-loaded document (found via David's
  // real-crash report, 2026-07-04). A counter (not a boolean) so overlapping
  // windows can't unmask early; a suppression window also swallows an
  // operator edit racing it — accepted: the next edit re-arms both.
  const programmaticEditRef = useRef(0);
  // Run `fn`'s synchronous dispatches under suppression.
  const runProgrammaticEdit = useCallback((fn: () => void) => {
    programmaticEditRef.current += 1;
    try {
      fn();
    } finally {
      programmaticEditRef.current -= 1;
    }
  }, []);
  // Track document dirtiness for Bible Helper sessions too (NOT just when
  // warnOnUnsavedChanges is set) so the host can confirm-before-discard on a
  // graceful editor close. The beforeunload guard below stays gated on
  // warnOnUnsavedChanges alone, so enabling tracking here does NOT add an
  // iframe beforeunload prompt for BH.
  const { dirty, markSaved } = usePlaygroundDirtyFlag(
    instance,
    warnOnUnsavedChanges || profile === "bible-helper",
    programmaticEditRef
  );
  const [documentReady, setDocumentReady] = useState(() => !src);
  const [canvasReady, setCanvasReady] = useState(false);
  // A seeded theme's backdrop SVG, stashed by the load effect and reconstructed
  // by a canvasReady-gated effect once the WASM SVG decoder has bound.
  const [pendingSeedBackdrop, setPendingSeedBackdrop] = useState<{
    svg: string;
    stageId: string;
  } | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null
  );
  const [errmsg, setErrmsg] = useState<string | null>(null);
  const [loadingOverlay, setLoadingOverlay] = useState(true);
  const [externalAssetUrls, setExternalAssetUrls] = useState<
    Record<string, string>
  >({});
  const externalAssetRefsKey = useEditorState(instance, (state) =>
    Object.entries(state.document.external_assets ?? {})
      .filter(([, asset]) => asset.kind === "image" || asset.kind === "video")
      .map(([ref]) => ref)
      .sort()
      .join(",")
  );
  const currentSceneHasVideo = useEditorState(instance, (state) => {
    if (!state.scene_id) return false;
    const pending = [...(state.document.links[state.scene_id] ?? [])];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (state.document.nodes[id]?.type === "video") return true;
      pending.push(...(state.document.links[id] ?? []));
    }
    return false;
  });
  const handleCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasElement(node);
  }, []);

  useUnsavedChangesWarning(() => {
    if (!warnOnUnsavedChanges) return false;
    // Keep local dev convenient (previous behavior).
    // if (process.env.NODE_ENV === "development") return false;
    return dirty;
  });

  // Editor → host: report unsaved-edits state so Bible Helper can confirm
  // before discarding on a graceful editor close. Posts the current value on
  // mount and on every change; the host treats "no message yet" as not-dirty.
  useEffect(() => {
    if (profile !== "bible-helper" || !parentOrigin) return;
    if (typeof window === "undefined" || window.parent === window) return;
    window.parent.postMessage(
      { type: BIBLE_HELPER_EDITOR_DIRTY_MESSAGE_TYPE, dirty },
      parentOrigin
    );
  }, [dirty, parentOrigin, profile]);

  // Native documents refer to imported images by CAS digest. The renderer
  // reports missing refs; the host returns only read-only rhema-local URLs.
  // Verify both size and SHA-256 before registering bytes in the WASM cache.
  useEffect(() => {
    if (profile !== "bible-helper" || !parentOrigin || !canvasReady) return;
    const pending = new Set<string>();
    const retryAfter = new Map<string, number>();
    const abort = new AbortController();
    instance.onUnresolvedImages = (refs) => {
      const repository = instance.state.document.external_assets ?? {};
      const now = Date.now();
      const wanted = refs.filter(
        (ref) =>
          repository[ref]?.kind === "image" &&
          !pending.has(ref) &&
          (retryAfter.get(ref) ?? 0) <= now
      );
      if (wanted.length === 0) return;
      for (const ref of wanted) pending.add(ref);
      void (async () => {
        try {
          const locations = await requestExternalAssetLocations(
            parentOrigin,
            wanted
          );
          const loaded: Record<string, Uint8Array> = {};
          await Promise.all(
            locations.map(async (location) => {
              try {
                loaded[location.ref] = await fetchVerifiedExternalAsset(
                  location,
                  abort.signal
                );
              } catch (error) {
                retryAfter.set(location.ref, Date.now() + 5000);
                console.warn(
                  `[rhema-assets] failed to hydrate ${location.ref.slice(0, 12)}`,
                  error
                );
              }
            })
          );
          if (!abort.signal.aborted && Object.keys(loaded).length > 0) {
            instance.loadImages(loaded);
          }
          const resolved = new Set(locations.map((item) => item.ref));
          for (const ref of wanted) {
            if (!resolved.has(ref)) retryAfter.set(ref, Date.now() + 5000);
          }
        } finally {
          for (const ref of wanted) pending.delete(ref);
        }
      })();
    };
    return () => {
      abort.abort();
      instance.onUnresolvedImages = null;
    };
  }, [canvasReady, instance, parentOrigin, profile]);

  // The browser owns native video playback while the WASM surface continues
  // to own hit-testing, selection and document mutation. Resolve CAS digests
  // through the same host allow-list used for images; the canonical document
  // remains portable and never receives a machine-local path.
  useEffect(() => {
    if (
      profile !== "bible-helper" ||
      !parentOrigin ||
      !documentReady ||
      !externalAssetRefsKey
    ) {
      setExternalAssetUrls({});
      return;
    }
    let cancelled = false;
    const refs = externalAssetRefsKey.split(",");
    void (async () => {
      const batches: string[][] = [];
      for (let i = 0; i < refs.length; i += 64) {
        batches.push(refs.slice(i, i + 64));
      }
      const locations = (
        await Promise.all(
          batches.map((batch) =>
            requestExternalAssetLocations(parentOrigin, batch)
          )
        )
      ).flat();
      if (cancelled) return;
      setExternalAssetUrls(
        Object.fromEntries(locations.map((item) => [item.ref, item.url]))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [documentReady, externalAssetRefsKey, parentOrigin, profile]);

  // Editor → host: ask for the operator's installed fonts, then keep them in a
  // ref + a family-name set (the latter tells the picker to render a local CSS
  // preview instead of the Google preview image). Requested once on mount.
  useEffect(() => {
    if (profile !== "bible-helper" || !parentOrigin) return;
    if (typeof window === "undefined" || window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== parentOrigin || e.source !== window.parent) return;
      const d = e.data as { type?: unknown; fonts?: unknown } | null;
      if (!d || d.type !== BIBLE_HELPER_LIST_SYSTEM_FONTS_RESULT) return;
      const items = buildLocalWebfontItems(d.fonts);
      if (items.length === 0) return;
      localFontItemsRef.current = items;
      setLocalFontFamilies(new Set(items.map((i) => i.family)));
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { type: BIBLE_HELPER_LIST_SYSTEM_FONTS_REQUEST },
      parentOrigin
    );
    return () => window.removeEventListener("message", onMessage);
  }, [profile, parentOrigin]);

  // Merge the local font items into the webfont registry. Re-runs whenever the
  // registry changes — so after the async Google-fonts warmup REPLACES the list
  // (dropping our locals), this re-injects them. Converges: once every local
  // family is present it stops dispatching, so there's no loop.
  useEffect(() => {
    if (profile !== "bible-helper") return;
    const locals = localFontItemsRef.current;
    if (locals.length === 0) return;
    const present = new Set(fonts.map((f) => f.family));
    const missing = locals.filter((l) => !present.has(l.family));
    if (missing.length === 0) return;
    instance.doc.dispatch({
      type: "__internal/webfonts#webfontList",
      webfontlist: {
        kind: "webfonts#webfontList",
        items: [...fonts, ...missing],
      },
    });
  }, [fonts, localFontFamilies, profile, instance]);

  // Crash-restore (item 6a): OPFS is written ONLY on explicit Save, so a crash
  // before saving loses the work. Debounce-write the live document to a SEPARATE
  // draft file on every edit; it's cleared on Save (saveThemeToBibleHelper) and
  // consumed by the restore prompt below on the next load. Subscribes to
  // document mutations directly — the dirty flag only transitions once, so it
  // can't drive per-edit autosave.
  useEffect(() => {
    if (profile !== "bible-helper" || !opfs) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const writeDraft = () => {
      try {
        // The draft is the JSON snapshot ONLY — image BYTES stay in the
        // WASM heap (restore re-inits from the snapshot; refs resolve via
        // the room's persisted images). Do NOT call instance.archivedir()
        // here: it copies every photo's bytes out of WASM per tick.
        const json = serializeRhemaEditorSnapshot(
          instance.getSnapshot().document
        );
        void opfs
          .get("document.draft.grida1")
          .write(new TextEncoder().encode(json));
      } catch (err) {
        console.warn("[bh] draft autosave failed", err);
      }
    };
    const unsubscribe = instance.doc.subscribeWithSelector(
      (state) => state.document,
      (_store, _next, _prev, action) => {
        if (action?.type === "document/reset") return; // load/init, not an edit
        if (programmaticEditRef.current > 0) return; // seed reconstruction, not an edit
        if (timer) clearTimeout(timer);
        timer = setTimeout(writeDraft, 1200);
      }
    );
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [profile, opfs, instance]);

  // Crash-restore: after the saved document loads, if a draft from an
  // interrupted session survived, offer to restore it (once per mount). The
  // saved document is loaded as normal first (this is purely additive — it never
  // changes the default load path); "Restore" swaps in the draft, "Discard"
  // clears it (written empty; the read below gates on length > 0).
  //
  // The latch flips only when the prompt actually fires, NOT when a check
  // starts: `documentReady` initializes TRUE for src-less mounts (every BH
  // session), so the mount-time check races the load effect flipping it
  // false — an early latch let that cancellation permanently swallow the
  // prompt (David's real-crash report, 2026-07-04). A cancelled or empty
  // check leaves the latch unset so the post-load re-run retries.
  const draftPromptedRef = useRef(false);
  useEffect(() => {
    if (
      profile !== "bible-helper" ||
      !opfs ||
      !documentReady ||
      draftPromptedRef.current
    )
      return;
    let cancelled = false;
    void (async () => {
      let draftDocument: ReturnType<typeof io.GRID.decode> | null = null;
      try {
        const bytes = await opfs.get("document.draft.grida1").read();
        if (bytes && bytes.length > 0) {
          const snapshot = io.snapshot.parse(new TextDecoder().decode(bytes));
          if (snapshot && snapshot.document) {
            draftDocument = snapshot.document as ReturnType<
              typeof io.GRID.decode
            >;
          }
        }
      } catch {
        // no draft / unreadable — nothing to restore
      }
      if (cancelled || !draftDocument) return;
      if (draftPromptedRef.current) return; // a concurrent pass already prompted
      draftPromptedRef.current = true;
      const docToRestore = draftDocument;
      // Host-driven restore (crash-notification "Restore" button): the
      // operator already chose — apply the draft silently, no prompt.
      if (restoreDraftOnBoot) {
        try {
          instance.commands.reset(
            editor.state.init({ editable: true, document: docToRestore }),
            "draft"
          );
        } catch (err) {
          console.error("[bh] draft auto-restore failed", err);
        }
        return;
      }
      const clearDraft = () => {
        try {
          void opfs.get("document.draft.grida1").write(new Uint8Array(0));
        } catch {
          /* best effort */
        }
      };
      toast("Restore unsaved changes?", {
        description: "Your last editor session ended before saving.",
        duration: Infinity,
        action: {
          label: "Restore",
          onClick: () => {
            try {
              instance.commands.reset(
                editor.state.init({ editable: true, document: docToRestore }),
                "draft"
              );
            } catch (err) {
              console.error("[bh] draft restore failed", err);
            }
          },
        },
        cancel: {
          label: "Discard",
          onClick: clearDraft,
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, opfs, documentReady, instance, editor, restoreDraftOnBoot]);

  // Host → editor: clear the crash-restore draft when the operator confirmed
  // "discard" on a graceful close, so those edits aren't re-offered next time.
  useEffect(() => {
    if (profile !== "bible-helper" || !opfs || !parentOrigin) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== parentOrigin || e.source !== window.parent) return;
      const d = e.data as { type?: unknown } | null;
      if (!d || d.type !== BIBLE_HELPER_DISCARD_DRAFT_MESSAGE_TYPE) return;
      try {
        void opfs.get("document.draft.grida1").write(new Uint8Array(0));
      } catch {
        /* best effort */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [profile, opfs, parentOrigin]);

  // SONG-slide word refresh (see the lyric-content message consts). The
  // slide's words are HOST data; the canvas's bound text node is a working
  // copy. Once per boot (after the document load settles) ask the host for
  // the room's current words and overwrite the bound node when it differs
  // — an interim Quick-edit in the host can never leave the canvas showing
  // stale words. Programmatic: no dirty flag, no draft write. A null reply
  // (not a song slide / host has no words) is a no-op.
  //
  // NOT run when a crash draft is being applied (restoreDraftOnBoot, or
  // the operator later clicking the in-editor Restore toast): the draft
  // may hold words edits that never reached the host — the restore's
  // whole purpose — and the refresh would overwrite exactly those. The
  // draft is authoritative for its session; a SAVE then writes its words
  // back to the host (the sync-back path).
  useEffect(() => {
    if (profile !== "bible-helper" || !parentOrigin || workspace !== "slide")
      return;
    if (restoreDraftOnBoot) return;
    if (typeof window === "undefined" || window.parent === window) return;
    if (!documentReady) return;
    let cancelled = false;

    const requestId = `lyric-${v4()}`;
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
    }, 5000);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== parentOrigin || e.source !== window.parent) return;
      const d = e.data as {
        type?: unknown;
        payload?: { requestId?: unknown; text?: unknown };
      } | null;
      if (!d || d.type !== BIBLE_HELPER_LYRIC_CONTENT_RESULT_MESSAGE_TYPE)
        return;
      const p = d.payload ?? {};
      if (p.requestId !== requestId) return;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      if (cancelled) return;
      const text = typeof p.text === "string" ? p.text : null;
      if (text === null) return;
      // A draft restore that happened while the reply was in flight wins —
      // never stomp restored words (see the effect doc above).
      if (draftPromptedRef.current) return;
      try {
        const doc = instance.getSnapshot()
          .document as grida.program.document.Document;
        runProgrammaticEdit(() => {
          for (const sid of doc.scenes_ref) {
            const bindings = getRhemaSceneBindings(doc, sid);
            const nodeId = bindings.scriptureNodeId;
            if (!nodeId) continue;
            const node = doc.nodes[nodeId] as { text?: unknown } | undefined;
            if (!node) continue;
            if (typeof node.text === "string" && node.text === text) continue;
            instance.commands.changeNodePropertyText(nodeId, text);
          }
        });
      } catch (err) {
        console.warn("[bh] lyric content refresh failed", err);
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      {
        type: BIBLE_HELPER_LYRIC_CONTENT_REQUEST_MESSAGE_TYPE,
        payload: { requestId, room: room_id ?? null },
      },
      parentOrigin
    );
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
  }, [
    profile,
    parentOrigin,
    workspace,
    documentReady,
    restoreDraftOnBoot,
    instance,
    room_id,
    runProgrammaticEdit,
  ]);

  useEffect(() => {
    if (backend !== "canvas") {
      setCanvasReady(true);
      return;
    }

    if (!canvasElement) {
      setCanvasReady(false);
      return;
    }

    let cancelled = false;
    setCanvasReady(false);

    const dpr = window.devicePixelRatio || 1;
    instance
      .mount(canvasElement, dpr)
      .then(() => {
        if (!cancelled) {
          setCanvasReady(true);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setErrmsg("Failed to mount canvas surface");
        console.error("Failed to mount canvas surface", error);
      });

    return () => {
      cancelled = true;
    };
  }, [backend, canvasElement, instance]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (src) {
        // If src is provided, load it and persist to OPFS
        const controller = new AbortController();
        setDocumentReady(false);

        try {
          const res = await fetch(src, { signal: controller.signal });
          if (!res.ok) {
            throw new Error(
              `Failed to fetch document: ${res.status} ${res.statusText}`
            );
          }
          const file = await res.json();
          if (cancelled) {
            return;
          }
          instance.commands.reset(
            editor.state.init({
              editable: true,
              document: file.document,
            }),
            src
          );

          // Persist loaded document to OPFS
          if (opfs) {
            try {
              const bytes = io.GRID.encode(file.document);
              await opfs.get("document.grida").write(bytes);
              // Also write document.grida1 for migration purposes
              const snapshotJson = io.snapshot.stringify({
                version: file.version,
                document: file.document,
              });
              await opfs
                .get("document.grida1")
                .write(new TextEncoder().encode(snapshotJson));
            } catch (error) {
              console.error("Failed to persist src to OPFS:", error);
            }
          }
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }
          console.error("Failed to load playground document", error);
        } finally {
          if (!cancelled) {
            setDocumentReady(true);
          }
        }
      } else {
        // No src: try to load from OPFS, otherwise use provided document or empty
        setDocumentReady(false);

        try {
          if (opfs) {
            // Bug E (BH 2026-05-28): the binary GRID/FlatBuffers schema in
            // `format/grida.fbs` has no `metadata` / `userdata` field, so
            // `io.GRID.encode` strips scene userdata on save. The Rhema
            // playground keys (rhema_bundle_name, rhema_workspace,
            // rhema_visibility_rule, rhema_clock_binding,
            // rhema_next_layout_binding, rhema_stage_node_id,
            // rhema_service_reference, rhema_component_kind) ALL live on
            // scene userdata, so reopening from the binary file resets
            // every one of them — bundle-name shows the default "Slide
            // Show", workspace falls back to "theme", etc. Confirmed via
            // the OPFS dump: `document.grida1` (JSON sidecar) carries
            // `rhema_bundle_name` correctly, but only `document.grida`
            // (binary) is read on load.
            //
            // Fix: prefer the JSON snapshot when present (it round-trips
            // userdata losslessly), fall back to the binary for older
            // OPFS state written before grida1 was added.
            let loadedDocument: ReturnType<typeof io.GRID.decode> | null = null;
            let loadSource: "json" | "binary" | null = null;

            try {
              const jsonBytes = await opfs.get("document.grida1").read();
              if (jsonBytes && jsonBytes.length > 0 && !cancelled) {
                const snapshotJson = new TextDecoder().decode(jsonBytes);
                const snapshot = io.snapshot.parse(snapshotJson);
                if (snapshot && snapshot.document) {
                  loadedDocument = snapshot.document as ReturnType<
                    typeof io.GRID.decode
                  >;
                  loadSource = "json";
                }
              }
            } catch (jsonError) {
              // grida1 missing or malformed — fall through to binary.
              // Only log when it's NOT a plain not-found (a doc saved
              // before grida1 existed is the expected miss path).
              if (
                !(
                  jsonError instanceof Error &&
                  jsonError.message.includes("not found")
                )
              ) {
                console.warn(
                  "OPFS grida1 JSON snapshot unreadable, falling back to binary:",
                  jsonError
                );
              }
            }

            if (!loadedDocument && !cancelled) {
              const bytes = await opfs.get("document.grida").read();
              if (bytes) {
                loadedDocument = io.GRID.decode(bytes);
                loadSource = "binary";
              }
            }

            if (loadedDocument && !cancelled) {
              const images: Record<string, Uint8Array> = {};
              const names = await opfs.listImages();
              for (const name of names) {
                const base = name.split("/").pop() ?? name;
                const ref = base.includes(".") ? base.split(".")[0]! : base;
                try {
                  images[ref] = await opfs.readImage(name);
                } catch {
                  // Ignore per-file errors; we still load the document.
                }
              }

              instance.commands.reset(
                editor.state.init({
                  editable: true,
                  document: loadedDocument,
                }),
                "opfs"
              );

              if (Object.keys(images).length > 0) {
                instance.loadImages(images);
              }

              if (loadSource === "binary") {
                // Heads-up for the operator: the binary fallback path
                // means scene userdata was dropped. After the next save
                // (which writes both formats), reopen will pick up the
                // JSON sidecar and userdata round-trips correctly.
                console.info(
                  "[opfs] loaded from binary fallback — scene userdata may be reset until next save"
                );
              }

              setDocumentReady(true);
              return;
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes("not found")) {
            // File doesn't exist yet - this is fine, continue to fallback
          } else {
            // Any decode, structural validation, or state-init failure
            // means the persisted data is incompatible with the current
            // version. Quarantine the stale files so the user's bytes are
            // preserved for possible future migration, then fall through
            // to the default document.
            console.warn(
              "OPFS document unusable (possible schema change), quarantining:",
              error
            );
            try {
              await opfs?.quarantine();
            } catch (quarantineError) {
              console.error(
                "Failed to quarantine stale OPFS data:",
                quarantineError
              );
            }
          }
        }

        // BH seed-from-payload: no OPFS document exists for this room. For a
        // builtin/default theme (authored in BH code, never opened in the
        // editor) or a freshly-cloned private slide theme, that used to open
        // a BLANK canvas. Ask the host for the stored theme JSON and
        // materialize a document from it. The seed is NOT persisted to OPFS —
        // it re-derives from BH's registry (the source of truth) on every
        // open until the operator saves, so it can never go stale.
        if (
          !cancelled &&
          profile === "bible-helper" &&
          parentOrigin &&
          room_id
        ) {
          try {
            const seed = await requestRhemaThemeSeed(
              parentOrigin,
              room_id,
              workspace
            );
            // Pipeline-v2 (plan section 5): when the reply carries the
            // editor's own document, load it EXACTLY like the OPFS path
            // (JSON snapshot for state incl. scene userdata; image bytes
            // from the archive zip). ANY failure falls through to the v1
            // materializer below — never a blank canvas.
            if (seed?.document && !cancelled) {
              try {
                const snapshot = io.snapshot.parse(
                  seed.document.snapshotJson
                ) as { document?: unknown } | null;
                if (!snapshot?.document) {
                  throw new Error("seed snapshot has no document");
                }
                const unpacked = io.archive.unpack(
                  new Uint8Array(seed.document.archiveBytes)
                );
                const seedImages: Record<string, Uint8Array> = {};
                for (const [name, bytes] of Object.entries(unpacked.images)) {
                  const base = name.split("/").pop() ?? name;
                  const ref = base.includes(".") ? base.split(".")[0]! : base;
                  seedImages[ref] = bytes;
                }
                instance.commands.reset(
                  editor.state.init({
                    editable: true,
                    document: snapshot.document as Parameters<
                      typeof editor.state.init
                    >[0]["document"],
                  }),
                  "bh-seed-document"
                );
                if (Object.keys(seedImages).length > 0) {
                  instance.loadImages(seedImages);
                }
                setDocumentReady(true);
                return;
              } catch (docError) {
                console.warn(
                  "[bh-seed] stored document load failed - falling back to the theme materializer:",
                  docError
                );
              }
            }
            const seedTheme = seed?.theme ?? null;
            if (seedTheme && !cancelled) {
              const { document: seededDocument, stageId } =
                materializeRhemaThemeDocument(seedTheme);
              instance.commands.reset(
                editor.state.init({
                  editable: true,
                  document: seededDocument,
                }),
                "bh-seed"
              );
              // Backdrop shapes need the WASM SVG decoder, which only binds
              // once the canvas surface mounts (after this load effect). Stash
              // the backdrop SVG + stage id; the canvasReady-gated effect below
              // reconstructs it and reparents it under the stage as the FIRST
              // child — so it renders BEHIND the text AND is re-exported on the
              // next save (otherwise a seeded backdrop theme would lose its
              // backdrop the first time the operator saves).
              if (seedTheme.backdropSvg && seedTheme.backdropSvg.trim()) {
                setPendingSeedBackdrop({
                  svg: seedTheme.backdropSvg,
                  stageId,
                });
              }
              setDocumentReady(true);
              return;
            }
          } catch (seedError) {
            console.warn(
              "[bh-seed] failed to seed from host payload:",
              seedError
            );
          }
        }

        // Fallback to provided document or empty
        if (!cancelled) {
          setDocumentReady(!!document);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    document,
    instance,
    src,
    opfs,
    backend,
    profile,
    parentOrigin,
    room_id,
    workspace,
  ]);

  // Reconstruct a seeded theme's backdrop once the canvas surface (and its SVG
  // decoder) has bound.
  //
  // Embedded PHOTOS are extracted FIRST and rebuilt as native image-fill
  // rectangles (original encoded bytes registered via createImage): the wasm
  // SVG import pipeline drops <image> nodes entirely, so feeding a picture
  // backdrop through createNodeFromSvg lost the photo in the editor AND the
  // next save deleted it from the theme permanently. Whatever paintable
  // content remains (shapes/paths) still goes through createNodeFromSvg as
  // before; everything is reparented under the stage behind the text layers.
  useEffect(() => {
    if (!pendingSeedBackdrop || !canvasReady) return;
    let cancelled = false;
    const { svg, stageId } = pendingSeedBackdrop;
    // Every dispatch below is programmatic reconstruction, not an operator
    // edit — suppress the crash-restore draft and the dirty flag for the
    // duration (see programmaticEditRef).
    programmaticEditRef.current += 1;
    void (async () => {
      try {
        const { images, remainderSvg } = extractBackdropImagesForSeed(svg);
        const orderedIds: string[] = [];
        for (const img of images) {
          const base64 = img.dataUri.replace(/^data:[^;]+;base64,/, "");
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
          const ref = await instance.createImage(bytes);
          if (cancelled) return;
          const inserted = instance.insert(
            {
              prototype: {
                type: "rectangle",
                name: "Backdrop image",
                layout_positioning: "absolute",
                layout_inset_left: Math.round(img.rect.x),
                layout_inset_top: Math.round(img.rect.y),
                layout_target_width: Math.max(1, Math.round(img.rect.width)),
                layout_target_height: Math.max(1, Math.round(img.rect.height)),
                fill: {
                  type: "solid",
                  color: kolor.colorformats.RGBA32F.fromHEX("#00000000"),
                  active: false,
                },
                fill_paints: [
                  {
                    type: "image",
                    src: ref.url,
                    fit: img.fit,
                    transform: cmath.transform.identity,
                    filters: cg.def.IMAGE_FILTERS,
                    blend_mode: cg.def.BLENDMODE,
                    opacity: 1,
                    active: true,
                  } satisfies cg.ImagePaint,
                ],
              },
            },
            stageId
          );
          if (inserted[0]) orderedIds.push(inserted[0]);
        }
        if (remainderSvg) {
          const backdrop =
            await instance.commands.createNodeFromSvg(remainderSvg);
          if (backdrop?.id) orderedIds.push(backdrop.id);
        }
        if (!cancelled && orderedIds.length > 0) {
          instance.commands.mv(orderedIds, stageId, 0);
        }
      } catch (backdropError) {
        console.warn(
          "[bh-seed] backdrop reconstruction failed:",
          backdropError
        );
      } finally {
        programmaticEditRef.current -= 1;
        if (!cancelled) setPendingSeedBackdrop(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingSeedBackdrop, canvasReady, instance]);

  const ready = documentReady && canvasReady;

  return (
    <>
      {loadingOverlay && (
        <FullscreenLoadingOverlay
          loading={!ready}
          errmsg={errmsg}
          onExitComplete={() => {
            setLoadingOverlay(false);
          }}
        />
      )}
      <ErrorBoundary>
        <TooltipProvider>
          <FontFamilyListProvider fonts={fonts}>
            <LocalFontFamiliesProvider families={localFontFamilies}>
              <StandaloneDocumentEditor editor={instance}>
                <div className="w-full h-full flex flex-row">
                  <SidebarProvider className="w-full h-full">
                    <main className="w-full h-full select-none relative">
                      <WindowGlobalCurrentEditorProvider />
                      <UserCustomTemplatesProvider templates={templates}>
                        <StarterKitOrgIdProvider
                          organizationId={organizationId}
                        >
                          <Consumer
                            backend={backend}
                            canvasRef={handleCanvasRef}
                            onSaved={markSaved}
                            filekey={resolvedFilekey}
                            initialSceneId={initialSceneId}
                            profile={profile}
                            parentOrigin={parentOrigin}
                            workspace={workspace}
                            runProgrammaticEdit={runProgrammaticEdit}
                            currentSceneHasVideo={currentSceneHasVideo}
                            externalAssetUrls={externalAssetUrls}
                          />
                        </StarterKitOrgIdProvider>
                      </UserCustomTemplatesProvider>
                    </main>
                  </SidebarProvider>
                </div>
              </StandaloneDocumentEditor>
            </LocalFontFamiliesProvider>
          </FontFamilyListProvider>
        </TooltipProvider>
      </ErrorBoundary>
    </>
  );
}

function Consumer({
  backend,
  canvasRef,
  onSaved,
  filekey,
  initialSceneId,
  profile,
  parentOrigin,
  workspace,
  runProgrammaticEdit,
  currentSceneHasVideo,
  externalAssetUrls,
}: {
  backend: "dom" | "canvas";
  canvasRef?: (canvas: HTMLCanvasElement | null) => void;
  onSaved: () => void;
  filekey: string;
  initialSceneId?: string;
  profile: "default" | "bible-helper";
  // Trusted Bible Helper opener origin, threaded through to SidebarLeft for
  // saveThemeToBibleHelper. Undefined when not launched from Bible Helper.
  parentOrigin?: string;
  /** "stage" routes scenes + save through the stage workspace. "slide"
   *  routes through the slide workspace (single-scene, simplified
   *  chrome, `bible-helper-slide-save` postMessage). */
  workspace?: "theme" | "stage" | "slide";
  /** Runs synchronous dispatches with the crash-restore draft + dirty flag
   *  suppressed — for the rhema boot normalizers, which are programmatic
   *  housekeeping, not operator edits. */
  runProgrammaticEdit: (fn: () => void) => void;
  currentSceneHasVideo: boolean;
  externalAssetUrls: Readonly<Record<string, string>>;
}) {
  const isBibleHelper = profile === "bible-helper";
  const {
    ui,
    toggleVisibility,
    toggleMinimal,
    rightSidebarTab,
    setRightSidebarTab,
  } = useUILayout();
  const instance = useCurrentEditor();
  const animationPreview = useNativeAnimationPreview(instance);
  const currentSceneNeedsDom =
    currentSceneHasVideo || animationPreview.hasAnimations;
  const opfs = usePlaygroundOPFS(filekey);
  const debug = useEditorState(instance, (state) => state.debug);
  const sceneMeta = useEditorState(instance, (state) => {
    const scene_id = state.scene_id;
    if (!scene_id) return null;
    const scene = state.document.nodes[scene_id];
    if (!scene || scene.type !== "scene") return null;
    const childIds = state.document.links[scene_id] ?? [];
    const sceneUserData = state.document.metadata?.[scene_id]?.userdata as
      | Record<string, unknown>
      | undefined;
    const stageIdRaw = sceneUserData?.rhema_stage_node_id;
    const explicitStageId = typeof stageIdRaw === "string" ? stageIdRaw : null;
    const explicitStageNode = explicitStageId
      ? state.document.nodes[explicitStageId]
      : undefined;
    const stageId =
      (explicitStageId &&
      childIds.includes(explicitStageId) &&
      isRhemaStageCandidate(explicitStageNode)
        ? explicitStageId
        : null) ??
      childIds.find((id) => isRhemaStageCandidate(state.document.nodes[id])) ??
      null;
    return {
      id: scene_id,
      name: scene.name,
      childIds,
      childrenCount: childIds.length,
      stageId,
    };
  });
  const initialSceneLoadedRef = useRef<string | null>(null);
  const initializedRhemaSceneIdsRef = useRef<Set<string>>(new Set());
  const rhemaMigratedSceneIdsRef = useRef<Set<string>>(new Set());
  const libraryWindowControls = useFloatingWindowControls({
    defaultOpen: false,
  });

  useEffect(() => {
    if (!initialSceneId) return;
    if (initialSceneLoadedRef.current === initialSceneId) return;
    if (sceneMeta?.id === initialSceneId) {
      initialSceneLoadedRef.current = initialSceneId;
      return;
    }
    const target = instance.state.document.nodes[initialSceneId];
    if (!target || target.type !== "scene") return;
    instance.commands.loadScene(initialSceneId);
    initialSceneLoadedRef.current = initialSceneId;
  }, [initialSceneId, instance, sceneMeta?.id]);

  useEffect(() => {
    if (!isBibleHelper || !sceneMeta) return;
    if (sceneMeta.name === "main") {
      instance.commands.renameScene(sceneMeta.id, "Theme 1");
    }
  }, [instance, isBibleHelper, sceneMeta]);

  useEffect(() => {
    if (!isBibleHelper || !sceneMeta) return;
    const sceneUserData = (instance.getUserData(sceneMeta.id) ?? {}) as Record<
      string,
      unknown
    >;
    const missingRhemaProfile =
      sceneUserData.rhema_profile !== "bible-helper" ||
      sceneUserData.rhema_lock_to_stage !== true;
    const existingStageId =
      typeof sceneUserData.rhema_stage_node_id === "string"
        ? sceneUserData.rhema_stage_node_id
        : null;
    const existingStageNode = existingStageId
      ? instance.state.document.nodes[existingStageId]
      : undefined;
    let stageId = existingStageId;

    if (
      !stageId ||
      !sceneMeta.childIds.includes(stageId) ||
      !isRhemaStageCandidate(existingStageNode)
    ) {
      stageId =
        sceneMeta.childIds.find((id) => {
          return isRhemaStageCandidate(instance.state.document.nodes[id]);
        }) ?? null;
    }

    if (!stageId) return;
    if (!missingRhemaProfile && stageId === existingStageId) return;

    runProgrammaticEdit(() => {
      instance.setUserData(sceneMeta.id, {
        ...sceneUserData,
        rhema_profile: "bible-helper",
        rhema_lock_to_stage: true,
        rhema_stage_node_id: stageId,
      });
    });
  }, [instance, isBibleHelper, sceneMeta, runProgrammaticEdit]);

  useEffect(() => {
    if (!isBibleHelper || !sceneMeta?.stageId) return;
    const stageNode = instance.state.document.nodes[sceneMeta.stageId];
    if (!isRhemaStageCandidate(stageNode)) return;

    const needsPositioningUpdate =
      stageNode.layout_positioning !== "absolute" ||
      stageNode.layout_inset_left !== 0 ||
      stageNode.layout_inset_top !== 0 ||
      stageNode.layout_target_width !== RHEMA_STAGE_WIDTH ||
      stageNode.layout_target_height !== RHEMA_STAGE_HEIGHT;

    const stageId = sceneMeta.stageId;
    if (needsPositioningUpdate) {
      runProgrammaticEdit(() => {
        instance.commands.changeNodePropertyPositioning(stageId, {
          layout_positioning: "absolute",
          layout_inset_left: 0,
          layout_inset_top: 0,
        });
        instance.commands.changeNodeSize(stageId, "width", RHEMA_STAGE_WIDTH);
        instance.commands.changeNodeSize(stageId, "height", RHEMA_STAGE_HEIGHT);
      });
    }

    if (stageNode.clips_content !== true) {
      runProgrammaticEdit(() => {
        instance.commands.changeContainerNodeClipsContent(stageId, true);
      });
    }
  }, [instance, isBibleHelper, sceneMeta, runProgrammaticEdit]);

  useEffect(() => {
    if (!isBibleHelper || !sceneMeta) return;
    // Normalize only when the stored value actually differs: the
    // unconditional dispatch fired on EVERY boot, marking untouched
    // sessions dirty and arming the draft autosave (which then overwrote a
    // surviving crash draft with the freshly-loaded document).
    const sceneNode = instance.state.document.nodes[sceneMeta.id] as
      | { background_color?: unknown }
      | undefined;
    const backgroundNeedsUpdate =
      JSON.stringify(sceneNode?.background_color ?? null) !==
      JSON.stringify(RHEMA_SCENE_BACKGROUND);
    if (sceneMeta.childrenCount > 0) {
      if (backgroundNeedsUpdate) {
        runProgrammaticEdit(() => {
          instance.commands.changeSceneBackground(
            sceneMeta.id,
            RHEMA_SCENE_BACKGROUND
          );
        });
      }
      initializedRhemaSceneIdsRef.current.add(sceneMeta.id);
      return;
    }
    if (initializedRhemaSceneIdsRef.current.has(sceneMeta.id)) return;

    initializedRhemaSceneIdsRef.current.add(sceneMeta.id);
    runProgrammaticEdit(() => {
      if (backgroundNeedsUpdate) {
        instance.commands.changeSceneBackground(
          sceneMeta.id,
          RHEMA_SCENE_BACKGROUND
        );
      }
      const inserted = instance.commands.insert(
        {
          prototype: createRhemaStagePrototype(),
        },
        null
      );
      const stageId = inserted[0];
      if (stageId) {
        const sceneUserData = (instance.getUserData(sceneMeta.id) ??
          {}) as Record<string, unknown>;
        instance.setUserData(sceneMeta.id, {
          ...sceneUserData,
          rhema_profile: "bible-helper",
          rhema_lock_to_stage: true,
          rhema_stage_node_id: stageId,
        });
      }
    });

    requestAnimationFrame(() => {
      instance.camera.fit("<scene>", { margin: 64 });
    });
  }, [instance, isBibleHelper, sceneMeta, runProgrammaticEdit]);

  useEffect(() => {
    if (!isBibleHelper || !sceneMeta) return;
    if (rhemaMigratedSceneIdsRef.current.has(sceneMeta.id)) return;

    const sceneUserData = (instance.getUserData(sceneMeta.id) ?? {}) as Record<
      string,
      unknown
    >;
    const stageIdRaw = sceneUserData.rhema_stage_node_id;
    if (typeof stageIdRaw !== "string") return;
    const stageNode = instance.state.document.nodes[stageIdRaw];
    if (!stageNode || stageNode.type !== "container") return;

    const stageRect = instance.getNodeAbsoluteBoundingRect(stageIdRaw);
    if (!stageRect) return;

    const sceneChildren = sceneMeta.childIds;
    for (const nodeId of sceneChildren) {
      if (nodeId === stageIdRaw) continue;
      const node = instance.state.document.nodes[nodeId];
      if (!node || node.type === "scene") continue;
      if (node.layout_positioning !== "absolute") continue;
      if (
        typeof node.layout_inset_left !== "number" ||
        typeof node.layout_inset_top !== "number"
      ) {
        continue;
      }

      const rect = instance.getNodeAbsoluteBoundingRect(nodeId);
      if (!rect) continue;

      let nextX = node.layout_inset_left;
      let nextY = node.layout_inset_top;
      const right = rect.x + rect.width;
      const bottom = rect.y + rect.height;
      const stageRight = stageRect.x + stageRect.width;
      const stageBottom = stageRect.y + stageRect.height;

      if (rect.x < stageRect.x) {
        nextX += stageRect.x - rect.x;
      } else if (right > stageRight) {
        nextX -= right - stageRight;
      }

      if (rect.y < stageRect.y) {
        nextY += stageRect.y - rect.y;
      } else if (bottom > stageBottom) {
        nextY -= bottom - stageBottom;
      }

      if (nextX !== node.layout_inset_left || nextY !== node.layout_inset_top) {
        runProgrammaticEdit(() => {
          instance.commands.changeNodePropertyPositioning(nodeId, {
            layout_positioning: node.layout_positioning,
            layout_inset_left: Math.round(nextX),
            layout_inset_top: Math.round(nextY),
          });
        });
      }
    }

    rhemaMigratedSceneIdsRef.current.add(sceneMeta.id);
  }, [instance, isBibleHelper, sceneMeta, runProgrammaticEdit]);

  useHotkeys(
    "shift+i",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // open-only behavior (don't toggle/close if already open)
      if (!libraryWindowControls.open) {
        libraryWindowControls.openWindow();
      }
    },
    {
      // keep shortcut disabled while typing (library default, made explicit here)
      enableOnFormTags: false,
      enableOnContentEditable: false,
      enabled: !isBibleHelper,
    }
  );

  // Check if there are selected nodes for conditional sidebar display
  const hasSelection = useEditorState(
    instance,
    (state) => state.selection.length > 0
  );

  // Determine if right sidebar should be visible
  const should_show_sidebar_right =
    ui.sidebar_right === "visible" ||
    (ui.sidebar_right === "floating-when-selection" && hasSelection);

  // Determine the variant for the right sidebar
  const sidebar_right_variant =
    ui.sidebar_right === "floating-when-selection" ? "floating" : "sidebar";

  useHotkeys("meta+\\, ctrl+\\", (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    toggleVisibility();
  });

  useHotkeys("meta+shift+\\, ctrl+shift+\\", (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    toggleMinimal();
  });

  useHotkeys("ctrl+`", () => {
    const debug = instance.toggleDebug();
    toast("Debug mode " + (debug ? "enabled" : "disabled"), {
      position: "bottom-left",
    });
  });

  // Cmd/Ctrl+S: save to OPFS
  useHotkeys(
    "meta+s, ctrl+s",
    async () => {
      if (opfs) {
        try {
          const dir = instance.archivedir();

          // Write images into OPFS (images/<hash>.<ext>)
          for (const [filename, bytes] of Object.entries(dir.images)) {
            await opfs.writeImage(filename, bytes);
          }

          const bytes = io.GRID.encode(dir.document);
          await opfs.get("document.grida").write(bytes);
          // Also write document.grida1 for migration purposes
          const snapshotJson = serializeRhemaEditorSnapshot(dir.document);
          await opfs
            .get("document.grida1")
            .write(new TextEncoder().encode(snapshotJson));
          onSaved();
          toast.success("Saved", {
            position: "bottom-left",
          });
        } catch (error) {
          console.error("Failed to save to OPFS:", error);
          toast.error("Failed to save", {
            position: "bottom-left",
          });
        }
      }
    },
    {
      preventDefault: true,
    }
  );

  return (
    <AgentChatProvider>
      <PreviewProvider>
        <FloatingWindowHost>
          <FloatingWindowBounds>
            {({ boundaryRef }) => (
              <>
                <SceneThumbnailProvider
                  enabled={isBibleHelper}
                  stage={workspace === "stage"}
                >
                  <div className="flex w-full h-full">
                    {ui.sidebar_left && (
                      <SidebarLeft
                        toggleVisibility={toggleVisibility}
                        toggleMinimal={toggleMinimal}
                        libraryWindowControls={libraryWindowControls}
                        showLibrary={!isBibleHelper}
                        isBibleHelper={isBibleHelper}
                        parentOrigin={parentOrigin}
                        opfs={opfs}
                        filekey={filekey}
                        workspace={workspace}
                        runProgrammaticEdit={runProgrammaticEdit}
                        onSaved={onSaved}
                      />
                    )}
                    <EditorSurfaceClipboardSyncProvider />
                    <EditorSurfaceDropzone>
                      <EditorSurfaceContextMenu>
                        <StandaloneSceneBackground className="w-full h-full flex flex-col relative ">
                          <ViewportRoot className="relative w-full h-full overflow-hidden">
                            <Hotkyes />
                            <EditorSurface />
                            {!isBibleHelper && <LocalFakeCursorChat />}
                            {/* {backend === "canvas" && (
                    <__WIP_UNSTABLE_WasmContent editor={instance} />
                  )} */}
                            {backend === "canvas" && (
                              <Canvas
                                ref={canvasRef}
                                hidden={currentSceneNeedsDom}
                              />
                            )}
                            {backend === "canvas" && currentSceneNeedsDom && (
                              <ExternalAssetUrlProvider
                                locations={externalAssetUrls}
                              >
                                <AnimationSampleProvider
                                  sample={animationPreview.sample}
                                >
                                  <div
                                    className="absolute inset-0 pointer-events-none"
                                    aria-hidden="true"
                                  >
                                    <AutoInitialFitTransformer>
                                      <StandaloneSceneContent primary={false} />
                                    </AutoInitialFitTransformer>
                                  </div>
                                </AnimationSampleProvider>
                              </ExternalAssetUrlProvider>
                            )}
                            {backend === "dom" && (
                              <ExternalAssetUrlProvider
                                locations={externalAssetUrls}
                              >
                                <AnimationSampleProvider
                                  sample={animationPreview.sample}
                                >
                                  <AutoInitialFitTransformer>
                                    <StandaloneSceneContent />
                                  </AutoInitialFitTransformer>
                                </AnimationSampleProvider>
                              </ExternalAssetUrlProvider>
                            )}
                            {isBibleHelper && (
                              <NativeAnimationInspector
                                instance={instance}
                                preview={animationPreview}
                              />
                            )}
                            {(isBibleHelper || ui.toolbar_bottom) && (
                              <>
                                {!isBibleHelper && (
                                  <BrushToolbarPosition>
                                    <BrushToolbar />
                                  </BrushToolbarPosition>
                                )}
                                {!isBibleHelper && (
                                  <PathToolbarPosition>
                                    <PathToolbar />
                                  </PathToolbarPosition>
                                )}
                                <ToolbarPosition>
                                  <PlaygroundToolbar profile={profile} />
                                </ToolbarPosition>
                              </>
                            )}
                            {isBibleHelper && workspace === "stage" && (
                              <StageComponentsToolbar />
                            )}
                          </ViewportRoot>
                          {debug && <DevtoolsPanel />}
                        </StandaloneSceneBackground>
                      </EditorSurfaceContextMenu>
                    </EditorSurfaceDropzone>
                    {should_show_sidebar_right && (
                      <SidebarRight
                        variant={sidebar_right_variant}
                        tab={rightSidebarTab}
                        setTab={setRightSidebarTab}
                        isBibleHelper={isBibleHelper}
                        workspace={workspace}
                      />
                    )}
                  </div>
                </SceneThumbnailProvider>
                {!isBibleHelper && (
                  <FloatingWindowRoot
                    windowId="library"
                    boundaryRef={boundaryRef}
                    initialX={260}
                    initialY={120}
                    width={360}
                    height={560}
                    controls={libraryWindowControls}
                    className="z-[999] max-h-[calc(100vh-48px)] overflow-hidden flex flex-col"
                    render={({ dragHandleProps, controls }) => (
                      <>
                        <FloatingWindowTitleBar
                          dragHandleProps={dragHandleProps}
                        >
                          <span className="font-medium text-sm">Library</span>
                          <FloatingWindowClose
                            windowId="library"
                            controls={controls}
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Cross1Icon className="size-4" aria-hidden />
                            <span className="sr-only">Close</span>
                          </FloatingWindowClose>
                        </FloatingWindowTitleBar>
                        <FloatingWindowBody className="p-0 text-sm h-full flex flex-col overflow-hidden">
                          <Library />
                        </FloatingWindowBody>
                      </>
                    )}
                  />
                )}
              </>
            )}
          </FloatingWindowBounds>
        </FloatingWindowHost>
      </PreviewProvider>

      {!isBibleHelper && ui.help_fab && rightSidebarTab !== "agent" && (
        <HelpFab className="absolute right-4 bottom-4" />
      )}
      {/* <CommandPalette /> */}
    </AgentChatProvider>
  );
}

function Canvas({
  ref,
  hidden = false,
}: {
  ref?: (canvas: HTMLCanvasElement | null) => void;
  hidden?: boolean;
}) {
  const dpr = useDPR();

  return (
    <WithSize
      className="w-full h-full max-w-full max-h-full"
      style={{
        // Force the canvas to respect container boundaries
        contain: "strict",
      }}
    >
      {({ width, height }) => (
        <canvas
          id="canvas"
          ref={ref}
          width={width * dpr}
          height={height * dpr}
          style={{
            width: width,
            height: height,
            opacity: hidden ? 0 : 1,
          }}
        />
      )}
    </WithSize>
  );
}

/**
 * Local Fake Cusror portal
 *
 * This is only active when fake cursor is required when typing chat
 */
function LocalFakeCursorChat() {
  const instance = useCurrentEditor();

  // Get cursor chat state from editor
  const cursorChatState = useEditorState(
    instance,
    (state) => state.local_cursor_chat
  );

  useHotkeys("/", (e) => {
    e.preventDefault();
    instance.surface.openCursorChat();
  });

  const handleValueChange = (value: string) => {
    instance.surface.updateCursorChatMessage(value);
  };

  const handleValueCommit = () => {
    // Clear message after commit
    instance.surface.updateCursorChatMessage(null);
  };

  const handleClose = () => {
    instance.surface.closeCursorChat();
  };

  return (
    <CursorChat
      open={cursorChatState.is_open}
      onValueChange={handleValueChange}
      onValueCommit={handleValueCommit}
      onClose={handleClose}
    />
  );
}

/**
 * Live-thumbnail capture is ON, rendered OFF the main thread: captures run
 * in a dedicated worker with its OWN headless raster-backend wasm instance
 * (scene-thumbnail-worker.ts via SceneThumbnailRenderer). The editor thread
 * only encodes the document (FBS, image bytes stripped) and hands over
 * image/font deltas; a hung render costs the worker (watchdog terminate +
 * respawn, repeat offenders quarantined) — never the editor. This replaced
 * the main-thread `editor.exportNodeAs` pipeline after the 2026-07-04
 * effects freeze (a synchronous main-thread wasm hang is unrecoverable
 * from JS). Set to `false` to fall back to placeholders everywhere.
 */
// Typed `boolean` (not a literal) so toggling this value never makes the
// capture pipeline below read as unreachable to the type-checker.
const ENABLE_LIVE_THUMBNAILS: boolean = true;

// Retry capture with backoff until the MAIN surface binds on a cold load —
// image bytes for the worker are extracted from the main wasm instance.
const READINESS_RETRY_DELAYS_MS: number[] = [120, 240, 480, 960, 1920, 3000];
// Trailing debounce for edit-driven re-captures. The render itself is
// off-thread; this only bounds doc-encode + postMessage churn.
const EDIT_RECAPTURE_DEBOUNCE_MS = 3000;

/**
 * Composite a (possibly transparent) PNG byte array onto an opaque black
 * background and return a PNG Blob. Stage-layout thumbnails need this: the
 * stage container fill is transparent (#00000000), so a bare `exportNodeAs`
 * is fully transparent and the (white) component text is invisible against
 * the light preview tile. Black mirrors the live stage output. Renderer-only
 * (uses <canvas>); callers fall back to the raw export if this throws so a
 * thumbnail is never lost.
 */
async function compositeOnOpaqueBlack(bytes: BlobPart): Promise<Blob> {
  const srcUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  try {
    const img = new Image();
    img.src = srcUrl;
    await img.decode();
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!out) throw new Error("toBlob returned null");
    return out;
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

/**
 * Owns the per-scene thumbnail cache and the "live active + cached others"
 * capture policy. Only the active (loaded) scene is renderable on the wasm
 * backend, so we capture: (1) on first visit to a scene, and (2) debounced
 * after edits to the active scene. Other scenes show their last snapshot;
 * never-visited scenes show a placeholder (handled by the tile). Cache is
 * in-memory only — never persisted.
 */
function SceneThumbnailProvider({
  enabled,
  stage,
  children,
}: React.PropsWithChildren<{ enabled: boolean; stage?: boolean }>) {
  const editor = useCurrentEditor();
  const cacheRef = useRef(new SceneThumbnailCache());
  const [version, setVersion] = useState(0);

  const sceneId = useEditorState(editor, (s) => s.scene_id);
  const scenesRef = useEditorState(editor, (s) => s.document.scenes_ref);

  // Off-thread render client: a worker with its own headless raster wasm
  // (see scene-thumbnail-renderer.ts). Created lazily on first capture,
  // terminated on unmount.
  const rendererRef = useRef<SceneThumbnailRenderer | null>(null);
  const capturingRef = useRef(false);
  const pendingSceneRef = useRef<string | null>(null);
  const captureRef = useRef<(id: string) => void>(() => {});

  useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // The MAIN surface must be bound before captures: the worker's image bytes
  // are extracted from the main wasm instance (__get_image_bytes_for_wasm).
  // PNG in exporter.formats === surface bound.
  const isExporterReady = useCallback(() => {
    const ex = (
      editor as unknown as { exporter?: { formats?: readonly string[] } }
    ).exporter;
    return !!ex && (ex.formats ?? []).includes("PNG");
  }, [editor]);

  const capture = useCallback(
    async (targetSceneId: string) => {
      if (!ENABLE_LIVE_THUMBNAILS) return; // kill-switch: placeholders everywhere
      if (!enabled) return;
      if (editor.state.scene_id !== targetSceneId) return; // only the loaded scene
      if (!isExporterReady()) return; // not bound yet — scheduleCapture retries
      const stageId = resolveRhemaStageNodeId(
        editor.state.document as never,
        targetSceneId,
        RHEMA_STAGE_NAME
      );
      if (!stageId) return;
      // Single-flight: never run two captures at once. If asked while busy,
      // remember the latest scene and re-run after.
      if (capturingRef.current) {
        pendingSceneRef.current = targetSceneId;
        return;
      }
      capturingRef.current = true;
      try {
        const renderer = (rendererRef.current ??= new SceneThumbnailRenderer());
        if (renderer.isQuarantined(targetSceneId)) return;
        const snapshot = editor.getSnapshot()
          .document as grida.program.document.Document;
        const fonts = editor
          .listLoadedFonts()
          .map((family) => {
            const item = editor.getFontItem(family);
            return item
              ? { family, urls: Object.values(item.files ?? {}) }
              : null;
          })
          .filter((f): f is { family: string; urls: string[] } => !!f);
        const bytes = await renderer.capture({
          docBytes: io.GRID.encode(snapshot),
          sceneId: targetSceneId,
          exportNodeId: stageId,
          width: 320,
          // Paint-level src URLs — the same enumeration archivedir persists,
          // and the exact ids image paints resolve at render time.
          imageRefs: new dq.DocumentStateQuery(
            snapshot
          ).persistable_image_srcs(),
          getImageBytes: (src) => {
            try {
              return editor.__get_image_bytes_for_wasm(src);
            } catch {
              return null;
            }
          },
          fonts,
          fallbackFonts: Array.from(
            editorNamespace.config.fonts.DEFAULT_FONT_FALLBACK_SET
          ),
        });
        if (editor.state.scene_id !== targetSceneId) return; // changed during await
        // Stage layouts render on a transparent container fill, so the export
        // is transparent and the (white) component text is invisible on the
        // light preview tile. Composite onto opaque black to mirror the live
        // stage output. Stage-only; theme thumbnails (opaque authored content)
        // are untouched. Fall back to the raw export if compositing fails.
        let blob: Blob = new Blob([bytes as BlobPart], { type: "image/png" });
        if (stage) {
          try {
            blob = await compositeOnOpaqueBlack(bytes as BlobPart);
          } catch {
            // compositing failed — keep the raw export already held in `blob`
          }
          if (editor.state.scene_id !== targetSceneId) return; // changed during composite
        }
        const url = URL.createObjectURL(blob);
        const prev = cacheRef.current.get(targetSceneId);
        cacheRef.current.set(targetSceneId, url);
        if (prev) URL.revokeObjectURL(prev.dataUrl);
        setVersion((v) => v + 1);
      } catch {
        // exporter not ready / timeout / empty scene -> keep placeholder
      } finally {
        capturingRef.current = false;
        const pending = pendingSceneRef.current;
        pendingSceneRef.current = null;
        // Re-run the most recent request that arrived mid-export (still active).
        if (pending && pending === editor.state.scene_id) {
          captureRef.current(pending);
        }
      }
    },
    [editor, enabled, stage, isExporterReady]
  );

  // Keep a stable ref to the latest capture for the in-flight re-run above.
  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  // Re-attempt capture until the WASM exporter is ready (root cause 1: on a
  // cold load the surface binds AFTER the first capture, and nothing retried).
  // Bounded backoff; gives up -> placeholder. Returns a cancel fn.
  const scheduleCapture = useCallback(
    (targetSceneId: string) => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let attempt = 0;
      const tick = () => {
        if (cancelled) return;
        if (!ENABLE_LIVE_THUMBNAILS || !enabled) return;
        if (editor.state.scene_id !== targetSceneId) return; // moved on
        if (isExporterReady()) {
          void capture(targetSceneId);
          return;
        }
        if (attempt >= READINESS_RETRY_DELAYS_MS.length) return; // give up
        timer = setTimeout(tick, READINESS_RETRY_DELAYS_MS[attempt++]);
      };
      tick();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    },
    [editor, enabled, isExporterReady, capture]
  );

  // Revoke any object URLs we created when the provider unmounts.
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      for (const id of cache.keys()) {
        const t = cache.get(id);
        if (t) URL.revokeObjectURL(t.dataUrl);
      }
    };
  }, []);

  // (1) Capture on first visit, after the new scene settles (double rAF).
  // scheduleCapture retries until the WASM exporter is ready (cold-load race).
  useEffect(() => {
    if (!enabled || !sceneId) return;
    if (!cacheRef.current.shouldCaptureOnVisit(sceneId)) return;
    let cancelSchedule: (() => void) | null = null;
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        cancelSchedule = scheduleCapture(sceneId);
      });
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      cancelSchedule?.();
    };
  }, [sceneId, enabled, scheduleCapture]);

  // (2) Debounced re-capture of the active scene on document edits.
  // Subscribes to document mutations directly (Object.is on the document
  // reference — cheap) instead of selecting `s.document` through
  // useEditorState, whose default deep-equal re-compared the WHOLE document
  // on every dispatch. Trailing debounce: continuous editing postpones the
  // capture entirely; it runs EDIT_RECAPTURE_DEBOUNCE_MS after the pause.
  useEffect(() => {
    if (!enabled) return;
    let cancelSchedule: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = editor.doc.subscribeWithSelector(
      (s) => s.document,
      () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const activeSceneId = editor.state.scene_id;
          if (!activeSceneId) return;
          cancelSchedule?.();
          cancelSchedule = scheduleCapture(activeSceneId);
        }, EDIT_RECAPTURE_DEBOUNCE_MS);
      }
    );
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      cancelSchedule?.();
    };
  }, [editor, enabled, scheduleCapture]);

  // Prune cache when scenes are removed (revoking their object URLs first).
  useEffect(() => {
    const valid = new Set(scenesRef ?? []);
    for (const id of cacheRef.current.keys()) {
      if (!valid.has(id)) {
        const t = cacheRef.current.get(id);
        if (t) URL.revokeObjectURL(t.dataUrl);
      }
    }
    cacheRef.current.prune(scenesRef ?? []);
    setVersion((v) => v + 1);
  }, [scenesRef]);

  const value = useMemo<SceneThumbnailContextValue>(
    () => ({ getThumbnail: (id) => cacheRef.current.get(id), version }),
    [version]
  );

  return (
    <SceneThumbnailContext.Provider value={value}>
      {children}
    </SceneThumbnailContext.Provider>
  );
}

function SidebarLeft({
  toggleVisibility,
  toggleMinimal,
  libraryWindowControls,
  showLibrary = true,
  isBibleHelper = false,
  parentOrigin,
  opfs,
  filekey,
  workspace = "theme",
  runProgrammaticEdit = (fn) => fn(),
  onSaved,
}: {
  toggleVisibility?: () => void;
  toggleMinimal?: () => void;
  libraryWindowControls?: ReturnType<typeof useFloatingWindowControls>;
  showLibrary?: boolean;
  isBibleHelper?: boolean;
  /** Used as the stable bundle id when sending a theme-bundle save payload. */
  filekey?: string;
  /** Workspace mode threaded down from the page route. Drives scene
   *  stamping, palette swap, save message channel, and chrome
   *  simplification (slide hides scene list, visibility rules, bundle
   *  name). */
  workspace?: "theme" | "stage" | "slide";
  // Trusted Bible Helper opener origin used as postMessage target in
  // saveThemeToBibleHelper. Undefined fails the save closed with a toast.
  parentOrigin?: string;
  // OPFS handle for persisting the editor document on Save Theme so the user
  // can reopen and edit existing themes instead of starting from blank canvas.
  opfs?: io.opfs.Handle | null;
  /** Dirty-flag/draft suppression for programmatic housekeeping dispatches
   *  (the workspace stamp reconcile below). Defaults to a plain call so
   *  non-BH usages are unaffected. */
  runProgrammaticEdit?: (fn: () => void) => void;
  /** Marks the session clean after a successful Save Theme / Save Theme
   *  Bundle. Without this only Cmd+S reset the dirty flag, so the host
   *  still asked "Exit without saving?" after a saved bundle AND offered a
   *  stale crash-restore at next boot (2026-07-07 report, item 6). */
  onSaved?: () => void;
}) {
  const editor = useCurrentEditor();
  const {
    activeSceneId,
    scenesCount,
    serviceReference,
    stageId,
    bundleName,
    backgroundVideoBlobKey,
  } = useEditorState(editor, (state) => {
    const sceneId = state.scene_id;
    const sceneIds = state.document.scenes_ref;
    const sceneUserData = sceneId
      ? ((state.document.metadata?.[sceneId]?.userdata as
          | Record<string, unknown>
          | undefined) ?? {})
      : {};
    const serviceReferenceRaw = sceneUserData[RHEMA_SERVICE_REFERENCE_KEY];
    const serviceReference =
      serviceReferenceRaw === "preacher" || serviceReferenceRaw === "singer"
        ? serviceReferenceRaw
        : null;
    const childIds = sceneId ? (state.document.links[sceneId] ?? []) : [];
    const stageIdRaw = sceneUserData.rhema_stage_node_id;
    const explicitStageId = typeof stageIdRaw === "string" ? stageIdRaw : null;
    const explicitStageNode = explicitStageId
      ? state.document.nodes[explicitStageId]
      : undefined;
    const stageId =
      (explicitStageId &&
      childIds.includes(explicitStageId) &&
      isRhemaStageCandidate(explicitStageNode)
        ? explicitStageId
        : null) ??
      childIds.find((id) => {
        return isRhemaStageCandidate(state.document.nodes[id]);
      }) ??
      null;

    // Bundle name lives on every scene's userData (no document-level userdata
    // in Grida's schema). Read the first non-empty value — all scenes are
    // kept in sync on rename.
    let bundleName: string | null = null;
    for (const sid of sceneIds) {
      const ud = state.document.metadata?.[sid]?.userdata as
        | Record<string, unknown>
        | undefined;
      const raw = ud?.[RHEMA_BUNDLE_NAME_KEY];
      if (typeof raw === "string" && raw.trim()) {
        bundleName = raw;
        break;
      }
    }

    // Workspace on the active scene.
    const rawWorkspaceUserData = sceneUserData[RHEMA_WORKSPACE_KEY];
    const activeWorkspace: RhemaWorkspace =
      rawWorkspaceUserData === "stage"
        ? "stage"
        : rawWorkspaceUserData === "slide"
          ? "slide"
          : "theme";

    // Active scene name — used by slide-workspace as the slide label
    // (single source of truth: rename the label → rename the scene →
    // saved payload's imported.name carries the new value to BH).
    const activeSceneNode = sceneId ? state.document.nodes[sceneId] : null;
    const activeSceneName =
      activeSceneNode && (activeSceneNode as { name?: string }).name
        ? (activeSceneNode as { name: string }).name
        : null;

    // Background-video reference on the active scene — drives the poster
    // placeholder sync below (the wasm canvas can't decode video).
    const bgVideoRaw = sceneUserData[RHEMA_BACKGROUND_VIDEO_KEY] as
      | { blobKey?: unknown }
      | undefined;
    const backgroundVideoBlobKey =
      bgVideoRaw && typeof bgVideoRaw.blobKey === "string"
        ? bgVideoRaw.blobKey
        : null;

    return {
      activeSceneId: sceneId ?? null,
      activeSceneName,
      scenesCount: sceneIds.length,
      sceneIds: [...sceneIds],
      serviceReference,
      stageId,
      bundleName,
      activeWorkspace,
      backgroundVideoBlobKey,
    };
  });

  const exportRhemaJson = useCallback(() => {
    if (!isBibleHelper || !activeSceneId) return;
    const payload = buildRhemaThemeRuntimeJson(
      editor.state.document,
      activeSceneId
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const sceneName = (payload.scene.name || "theme")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    saveAs(blob, `${sceneName || "theme"}.rhema.json`);
  }, [activeSceneId, editor.state.document, isBibleHelper]);

  // Background-video POSTER sync (2026-07-09, issue 2): whenever the active
  // scene references a background video and its poster placeholder is
  // missing or stale (video replaced), fetch the poster frame from the BH
  // host and paint it as a locked image rect at the bottom of the stage —
  // so the operator designs against the video instead of a clear stage.
  // Programmatic housekeeping: never arms the dirty flag / crash draft.
  // Covers BOTH the fresh-upload path (userdata stamp re-runs this effect)
  // and reopen (poster rides the saved doc; only re-fetched if lost).
  useEffect(() => {
    if (!isBibleHelper || !activeSceneId || !parentOrigin) return;
    if (!backgroundVideoBlobKey) return;
    const havePoster =
      findBgVideoPosterIdsInScene(editor.state.document, activeSceneId).length >
      0;
    if (
      havePoster &&
      readPosterSourceBlobKey(editor, activeSceneId) === backgroundVideoBlobKey
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const dataUri = await requestBgVideoPosterFromHost(
        parentOrigin,
        backgroundVideoBlobKey
      );
      if (cancelled || !dataUri) return;
      try {
        await applyBgVideoPoster(
          editor,
          activeSceneId,
          dataUri,
          backgroundVideoBlobKey,
          runProgrammaticEdit
        );
      } catch (err) {
        console.warn("[bg-video] poster apply failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isBibleHelper,
    activeSceneId,
    parentOrigin,
    backgroundVideoBlobKey,
    editor,
    runProgrammaticEdit,
  ]);

  const saveThemeToBibleHelper = useCallback(async () => {
    if (!isBibleHelper || !activeSceneId) return;
    // Persist the editor document to OPFS first so reopening the theme
    // restores the design (without this, Save Theme only broadcasts the
    // runtime payload; the editor's own document state is never written
    // and the next "Open Editor" loads an empty canvas).
    if (opfs) {
      try {
        const dir = editor.archivedir();
        for (const [filename, bytes] of Object.entries(dir.images)) {
          await opfs.writeImage(filename, bytes);
        }
        const docBytes = io.GRID.encode(dir.document);
        await opfs.get("document.grida").write(docBytes);
        const snapshotJson = serializeRhemaEditorSnapshot(dir.document);
        await opfs
          .get("document.grida1")
          .write(new TextEncoder().encode(snapshotJson));
        // Item 6a: the just-saved state is canonical, so the crash-restore
        // draft is stale — clear it (empty write; the restore check gates on
        // length > 0) so reopening doesn't offer to restore already-saved work.
        await opfs.get("document.draft.grida1").write(new Uint8Array(0));
      } catch (err) {
        console.error("[themes-temp:diag] OPFS persist failed", err);
        toast.warning(
          "Theme saved but editor state did not persist — reopening may show a blank canvas."
        );
      }
    }
    const payload = buildRhemaThemeRuntimeJson(
      editor.state.document,
      activeSceneId
    );
    // Export the Rhema stage container, NOT the scene root. Scene root is not
    // a renderable node on the wasm backend (exportNodeAs throws "Failed to
    // export node as SVG"). The stage is the 1920×1080 canvas container,
    // detected upstream via isRhemaStageCandidate. Fall back to the scene
    // only when no stage is present (legacy themes).
    const exportTargetId = stageId ?? activeSceneId;
    try {
      console.info(
        "[themes-temp:diag] starting SVG export, target",
        exportTargetId,
        stageId ? "(stage)" : "(scene fallback)"
      );
      // Poster placeholders are editor chrome — hidden for the export so a
      // frozen video frame never bakes into backdropSvg (the live output
      // plays the real video under the layers).
      const svgBytes = await hideBgVideoPostersDuring(
        editor,
        runProgrammaticEdit,
        () => editor.exportNodeAs(exportTargetId, "SVG", { format: "SVG" })
      );
      const svgText =
        typeof svgBytes === "string"
          ? svgBytes
          : new TextDecoder().decode(svgBytes as AllowSharedBufferSource);
      console.info(
        "[themes-temp:diag] SVG export ok, raw length",
        svgText.length,
        "first 200 chars:",
        svgText.slice(0, 200)
      );
      payload.backdropSvg = stripTextFromSvg(svgText);
      console.info(
        "[themes-temp:diag] stripped SVG length",
        payload.backdropSvg.length
      );
    } catch (err) {
      // Surface visibly — silent null on backdropSvg was the original
      // regression that lost user-designed shapes without warning.
      console.error("[themes-temp:diag] SVG export failed for backdrop", err);
      toast.warning(
        "Theme saved without backdrop — SVG export failed. Check console for details."
      );
      payload.backdropSvg = null;
    }
    if (!parentOrigin) {
      toast.error(
        "Bible Helper origin missing — reopen the editor from Bible Helper to save themes."
      );
      return;
    }
    // Route to the slide save channel when this editor session is in
    // the slide workspace. BH stores private slide themes via a
    // distinct upsert path (close-on-save, keyed by privateOwnerSlideId);
    // sending on the theme channel would surface the slide in the
    // public theme picker.
    const messageType =
      workspace === "slide"
        ? BIBLE_HELPER_SLIDE_SAVE_MESSAGE_TYPE
        : BIBLE_HELPER_THEME_SAVE_MESSAGE_TYPE;
    const savedLabel = workspace === "slide" ? "Slide" : "Theme";
    if (window.parent && window.parent !== window) {
      // Pipeline-v2 (BH plan r3 section 3): attach the editor's OWN document
      // (archive zip + userdata-preserving JSON snapshot) so BH stores it as
      // the source of truth — reopen loads it exactly like OPFS instead of
      // reverse-engineering the export. archivedir() throws when the WASM
      // runtime can't supply image bytes; a save must NEVER fail because
      // archiving failed, so this degrades to a pure v1 payload.
      const documentPayload = buildSaveDocumentPayload(editor);
      window.parent.postMessage(
        {
          type: messageType,
          payload: documentPayload
            ? { ...payload, document: documentPayload }
            : payload,
        },
        parentOrigin,
        documentPayload ? [documentPayload.archiveBytes] : []
      );
      // The session is clean now: reset the dirty flag so the host's
      // exit-without-saving confirm and boot-time restore breadcrumb both
      // stand down (they key off the bible-helper-editor-dirty broadcast).
      onSaved?.();
      toast.success(
        `Saved ${savedLabel} "${payload.scene.name}" to Bible Helper.`
      );
      return;
    }
    toast.error("Bible Helper parent window was not detected.");
  }, [
    activeSceneId,
    editor,
    isBibleHelper,
    parentOrigin,
    stageId,
    opfs,
    workspace,
    onSaved,
  ]);

  /**
   * Bundle save — iterates every scene in the document, builds a per-scene
   * runtime payload, exports each scene's stage SVG for the backdrop, and
   * postMessages the whole bundle to BH in one envelope. Used when the
   * operator has named the bundle (sidebar label != "Themes") OR when the
   * document has >= 2 scenes. Single-scene unnamed docs continue to use
   * the original per-theme save flow.
   */
  const saveThemeBundleToBibleHelper = useCallback(async () => {
    if (!isBibleHelper) return;
    const sceneIdsSnapshot = [...editor.state.document.scenes_ref];
    if (sceneIdsSnapshot.length === 0) return;
    if (!parentOrigin) {
      toast.error(
        "Bible Helper origin missing — reopen the editor from Bible Helper to save themes."
      );
      return;
    }

    if (opfs) {
      try {
        const dir = editor.archivedir();
        for (const [filename, bytes] of Object.entries(dir.images)) {
          await opfs.writeImage(filename, bytes);
        }
        const docBytes = io.GRID.encode(dir.document);
        await opfs.get("document.grida").write(docBytes);
        const snapshotJson = serializeRhemaEditorSnapshot(dir.document);
        await opfs
          .get("document.grida1")
          .write(new TextEncoder().encode(snapshotJson));
        // Item 6a: the just-saved state is canonical, so the crash-restore
        // draft is stale — clear it (mirrors the single-theme save; without
        // this every bundle save leaves a pre-save draft that the next open
        // offers to "restore").
        await opfs.get("document.draft.grida1").write(new Uint8Array(0));
      } catch (err) {
        console.error("[themes-temp:diag] OPFS persist failed (bundle)", err);
        toast.warning(
          "Bundle saved but editor state did not persist — reopening may show a blank canvas."
        );
      }
    }

    // Capture the originally-active scene so we can restore it after the
    // export loop — exportNodeAs renders against the currently-loaded
    // scene only, so we must switch scene per layout.
    const originalActiveSceneId = activeSceneId;

    const layouts: ReturnType<typeof buildRhemaThemeRuntimeJson>[] = [];
    for (const sid of sceneIdsSnapshot) {
      const payload = buildRhemaThemeRuntimeJson(editor.state.document, sid);
      // Resolve this scene's stage node so we can export its SVG. Scene
      // userData (rhema_stage_node_id) points at it; fall back to the
      // first child container.
      const ud = (editor.getUserData(sid) ?? {}) as Record<string, unknown>;
      const explicitStageRaw = ud.rhema_stage_node_id;
      const explicitStage =
        typeof explicitStageRaw === "string" ? explicitStageRaw : null;
      const childIds = editor.state.document.links[sid] ?? [];
      const stageNodeId =
        (explicitStage &&
        childIds.includes(explicitStage) &&
        isRhemaStageCandidate(editor.state.document.nodes[explicitStage])
          ? explicitStage
          : null) ??
        childIds.find((id) =>
          isRhemaStageCandidate(editor.state.document.nodes[id])
        ) ??
        sid;
      // Switch the canvas to this scene before exporting so the wasm
      // backend has rendered its nodes. Without this, non-active scenes
      // export blank SVGs (the original symptom: "second theme has no
      // shapes"). Two-frame wait gives the renderer time to flush.
      try {
        editor.commands.loadScene(sid);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      } catch (err) {
        console.warn(
          "[themes-temp:diag] loadScene failed for bundle export, scene",
          sid,
          err
        );
      }
      try {
        // Poster placeholders stay out of backdropSvg (see the flat save).
        const svgBytes = await hideBgVideoPostersDuring(
          editor,
          runProgrammaticEdit,
          () => editor.exportNodeAs(stageNodeId, "SVG", { format: "SVG" })
        );
        const svgText =
          typeof svgBytes === "string"
            ? svgBytes
            : new TextDecoder().decode(svgBytes as AllowSharedBufferSource);
        payload.backdropSvg = stripTextFromSvg(svgText);
      } catch (err) {
        console.error(
          "[themes-temp:diag] bundle SVG export failed for scene",
          sid,
          err
        );
        payload.backdropSvg = null;
      }
      layouts.push(payload);
    }
    // Restore original active scene so the operator's editor view doesn't
    // jump unexpectedly after Save Theme Bundle.
    if (
      originalActiveSceneId &&
      originalActiveSceneId !== editor.state.scene_id
    ) {
      try {
        editor.commands.loadScene(originalActiveSceneId);
      } catch {
        /* non-fatal — operator can switch manually */
      }
    }

    const bundleId = filekey ?? `bundle-${v4()}`;
    const envelope: RhemaThemeBundleRuntimeJson = {
      kind: "rhema-theme-bundle",
      version: 1,
      bundleName: bundleName ?? "Untitled Bundle",
      bundleId,
      layouts,
    };

    // Route to the right channel per workspace:
    //   stage → stage-bundle (separate stage-layout registry)
    //   slide → slide-bundle (writes N slides into a library entry)
    //   theme → theme-bundle (multi-scene theme registry)
    const messageType =
      workspace === "stage"
        ? BIBLE_HELPER_STAGE_BUNDLE_SAVE_MESSAGE_TYPE
        : workspace === "slide"
          ? BIBLE_HELPER_SLIDE_BUNDLE_SAVE_MESSAGE_TYPE
          : BIBLE_HELPER_THEME_BUNDLE_SAVE_MESSAGE_TYPE;
    const bundleKind =
      workspace === "stage"
        ? "stage bundle"
        : workspace === "slide"
          ? "slide deck"
          : "bundle";

    if (window.parent && window.parent !== window) {
      // Pipeline-v2 (BH plan r3 section 3): ONE document per bundle save —
      // the multi-scene editor document IS the bundle's source of truth.
      // Degrades to a pure v1 payload when archiving fails.
      const documentPayload = buildSaveDocumentPayload(editor);
      window.parent.postMessage(
        {
          type: messageType,
          payload: documentPayload
            ? { ...envelope, document: documentPayload }
            : envelope,
        },
        parentOrigin,
        documentPayload ? [documentPayload.archiveBytes] : []
      );
      // Clean now — reset the dirty flag exactly like the single-theme save
      // (this bundle path was the one the 2026-07-07 report hit: "saved the
      // bundle" then still asked Exit without saving).
      onSaved?.();
      toast.success(
        `Saved ${bundleKind} "${envelope.bundleName}" (${layouts.length} layout${layouts.length === 1 ? "" : "s"}) to Bible Helper.`
      );
      return;
    }
    toast.error("Bible Helper parent window was not detected.");
  }, [
    activeSceneId,
    bundleName,
    editor,
    filekey,
    isBibleHelper,
    opfs,
    workspace,
    parentOrigin,
    onSaved,
  ]);

  /** Set the workspace ("theme" or "stage") on the active scene. */
  const _setActiveSceneWorkspace = useCallback(
    (next: RhemaWorkspace) => {
      if (!activeSceneId) return;
      const current = (editor.getUserData(activeSceneId) ?? {}) as Record<
        string,
        unknown
      >;
      editor.setUserData(activeSceneId, {
        ...current,
        [RHEMA_WORKSPACE_KEY]: next,
      });
    },
    [activeSceneId, editor]
  );

  /**
   * Ensure the active scene has a 1920x1080 stage container, creating
   * one at scene root if missing. Returns the stage id, or null if there
   * is no active scene. Reads the latest state synchronously so palette
   * inserts don't race the useEditorState selector.
   */
  const ensureStageContainerId = useCallback((): string | null => {
    if (!activeSceneId) return null;
    const childIds = editor.state.document.links[activeSceneId] ?? [];
    const existing = childIds.find((id) =>
      isRhemaStageCandidate(editor.state.document.nodes[id])
    );
    if (existing) return existing;
    const sceneUserData = (editor.getUserData(activeSceneId) ?? {}) as Record<
      string,
      unknown
    >;
    const inserted = editor.commands.insert(
      { prototype: createRhemaStagePrototype() },
      null
    );
    const createdStageId = inserted[0];
    if (!createdStageId) return null;
    editor.setUserData(activeSceneId, {
      ...sceneUserData,
      rhema_profile: "bible-helper",
      rhema_lock_to_stage: true,
      rhema_stage_node_id: createdStageId,
    });
    return createdStageId;
  }, [activeSceneId, editor]);

  /**
   * Insert every component from a stage template into the active stage
   * container, applying the template's frame overrides on top of each
   * component's default prototype. Each component is stamped with its
   * kind, same as a single-component insert.
   *
   * Templates are picked from the sidebar dropdown — Blank short-
   * circuits (no inserts). For non-blank templates, the operator
   * typically picks one on an empty scene right after creation.
   */
  // When the editor is opened in stage or slide workspace, ensure every
  // existing scene in the document carries the workspace stamp on its
  // userdata. This catches scenes Grida auto-creates from EMPTY_DOCUMENT
  // (which don't pass through onCreateTheme) so saved bundles always
  // carry the discriminator that drives BH's runtime pipeline.
  //
  // Slide mode also normalises the default scene name "Scene 1" /
  // "Theme 1" (whatever EMPTY_DOCUMENT ships) to "Slide 1" so the
  // operator-facing scene list reads coherently from the first frame
  // (operator request 2026-05-28).
  //
  // Implementation: use editor.doc.subscribeWithSelector so the
  // normalisation runs every time the document state commits — covers
  // the OPFS-load race where our one-shot effect can run BEFORE
  // OPFS rehydrates and then never re-fire (scenes_ref / activeSceneId
  // don't change, so the deps-based effect doesn't re-run).
  useEffect(() => {
    if (!isBibleHelper) return;
    if (workspace !== "stage" && workspace !== "slide") return;

    const reconcile = () => {
      // Programmatic normalisation, not an operator edit — without the
      // suppression, a freshly-seeded slide/stage document whose scene
      // userdata lags the URL workspace flipped the DIRTY flag (and
      // armed the crash-draft autosave) on plain OPEN: the host then
      // recorded phantom "unsaved edits" and a kill mid-look offered a
      // restore for a document nobody touched (found E2E 2026-07-06).
      runProgrammaticEdit(() => {
        const doc = editor.state.document;
        for (const sid of doc.scenes_ref) {
          const ud = (editor.getUserData(sid) ?? {}) as Record<string, unknown>;
          if (ud[RHEMA_WORKSPACE_KEY] !== workspace) {
            editor.setUserData(sid, {
              ...ud,
              [RHEMA_WORKSPACE_KEY]: workspace,
            });
          }
          if (workspace === "slide") {
            const sceneNode = doc.nodes[sid] as { name?: string } | undefined;
            const currentName = (sceneNode?.name ?? "").trim();
            const isAutoDefault =
              /^(Scene|Theme) \d+$/.test(currentName) ||
              currentName === "Untitled Slide";
            if (isAutoDefault) {
              const idx = doc.scenes_ref.indexOf(sid);
              const slideNum = idx >= 0 ? idx + 1 : 1;
              editor.commands.renameScene(sid, `Slide ${slideNum}`);
            }
          }
        }
      });
    };

    reconcile();
    const unsubscribe = editor.doc.subscribeWithSelector(
      (state) => ({
        scenes: state.document.scenes_ref,
        // Include node-name signatures so an OPFS rehydrate that swaps
        // scene names (e.g., "Theme 1" → real name) triggers the
        // subscriber and we rename only when necessary.
        names: state.document.scenes_ref
          .map(
            (id) => (state.document.nodes[id] as { name?: string })?.name ?? ""
          )
          .join("|"),
      }),
      () => reconcile()
    );
    return unsubscribe;
  }, [editor, isBibleHelper, workspace]);

  const insertStageTemplate = useCallback(
    (templateId: string) => {
      if (!isBibleHelper || !activeSceneId) return;
      const template = STAGE_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;
      const parentId = ensureStageContainerId();
      if (!parentId) return;
      for (const slot of template.components) {
        const spec = STAGE_COMPONENTS.find((c) => c.kind === slot.kind);
        if (!spec) continue;
        // Override frame fields from the template on top of the
        // component's default prototype. Width/height/left/top are all
        // optional; absent fields keep the component's defaults.
        const proto = spec.prototype() as Record<string, unknown>;
        if (slot.left !== undefined) proto.layout_inset_left = slot.left;
        if (slot.top !== undefined) proto.layout_inset_top = slot.top;
        if (slot.width !== undefined) proto.layout_target_width = slot.width;
        if (slot.height !== undefined) proto.layout_target_height = slot.height;
        const inserted = editor.commands.insert(
          { prototype: proto as grida.program.nodes.NodePrototype },
          parentId
        );
        const newNodeId = inserted[0];
        if (!newNodeId) continue;
        // Defeat Grida's viewport-relative smart-placement offset by
        // overwriting the final position with the prototype's intended
        // stage-local coords. See insertStageComponent for context.
        const protoLeft = proto.layout_inset_left;
        const protoTop = proto.layout_inset_top;
        const protoWidth = proto.layout_target_width;
        const protoHeight = proto.layout_target_height;
        if (typeof protoLeft === "number" && typeof protoTop === "number") {
          editor.commands.changeNodePropertyPositioning(newNodeId, {
            layout_positioning: "absolute",
            layout_inset_left: protoLeft,
            layout_inset_top: protoTop,
          });
        }
        if (typeof protoWidth === "number") {
          editor.commands.changeNodeSize(newNodeId, "width", protoWidth);
        }
        if (typeof protoHeight === "number") {
          editor.commands.changeNodeSize(newNodeId, "height", protoHeight);
        }
        const current = (editor.getUserData(newNodeId) ?? {}) as Record<
          string,
          unknown
        >;
        editor.setUserData(newNodeId, {
          ...current,
          [RHEMA_COMPONENT_KIND_KEY]: spec.kind,
        });
      }
    },
    [activeSceneId, editor, ensureStageContainerId, isBibleHelper]
  );

  const setServiceReference = useCallback(
    async (mode: "preacher" | "singer" | null) => {
      if (!isBibleHelper || !activeSceneId) return;
      const current = (editor.getUserData(activeSceneId) ?? {}) as Record<
        string,
        unknown
      >;
      const sceneChildren = editor.state.document.links[activeSceneId] ?? [];
      const sceneNode = editor.state.document.nodes[activeSceneId];
      const stageIdFromUserData =
        typeof current.rhema_stage_node_id === "string"
          ? current.rhema_stage_node_id
          : null;
      const stageNodeFromUserData = stageIdFromUserData
        ? editor.state.document.nodes[stageIdFromUserData]
        : undefined;
      let resolvedStageId =
        (stageIdFromUserData &&
        sceneChildren.includes(stageIdFromUserData) &&
        isRhemaStageCandidate(stageNodeFromUserData)
          ? stageIdFromUserData
          : null) ??
        (stageId &&
        sceneChildren.includes(stageId) &&
        isRhemaStageCandidate(editor.state.document.nodes[stageId])
          ? stageId
          : null) ??
        sceneChildren.find((id) =>
          isRhemaStageCandidate(editor.state.document.nodes[id])
        ) ??
        null;
      if (
        !resolvedStageId &&
        sceneNode &&
        sceneNode.type === "scene" &&
        (sceneNode.name.startsWith("Theme ") ||
          current.rhema_profile === "bible-helper")
      ) {
        const inserted = editor.insert(
          { prototype: createRhemaStagePrototype() },
          null
        );
        const createdStageId = inserted[0];
        if (createdStageId) {
          resolvedStageId = createdStageId;
          editor.setUserData(activeSceneId, {
            ...current,
            rhema_profile: "bible-helper",
            rhema_lock_to_stage: true,
            rhema_stage_node_id: createdStageId,
          });
        }
      }
      const existingPreviewNodeId =
        typeof current[RHEMA_SERVICE_REFERENCE_NODE_KEY] === "string"
          ? (current[RHEMA_SERVICE_REFERENCE_NODE_KEY] as string)
          : null;

      if (existingPreviewNodeId) {
        const hasExistingNode =
          editor.state.document.nodes[existingPreviewNodeId];
        if (hasExistingNode) {
          editor.commands.delete([existingPreviewNodeId]);
        }
      }

      if (!mode || !resolvedStageId) {
        if (mode && !resolvedStageId) {
          toast.error("Stage not found in current theme");
        }
        editor.setUserData(activeSceneId, {
          ...current,
          [RHEMA_SERVICE_REFERENCE_KEY]: mode,
          [RHEMA_SERVICE_REFERENCE_NODE_KEY]: null,
        });
        return;
      }

      let imageRef: Readonly<grida.program.document.ImageRef>;
      try {
        imageRef = await editor.createImageAsync(
          RHEMA_SERVICE_REFERENCE_IMAGES[mode]
        );
      } catch (error) {
        toast.error("Failed to load service reference image");
        console.error("Failed to load service reference image", error);
        editor.setUserData(activeSceneId, {
          ...current,
          [RHEMA_SERVICE_REFERENCE_KEY]: null,
          [RHEMA_SERVICE_REFERENCE_NODE_KEY]: null,
        });
        return;
      }
      const stageNode = editor.state.document.nodes[resolvedStageId];
      if (!stageNode || stageNode.type !== "container") {
        editor.setUserData(activeSceneId, {
          ...current,
          [RHEMA_SERVICE_REFERENCE_KEY]: mode,
          [RHEMA_SERVICE_REFERENCE_NODE_KEY]: null,
        });
        return;
      }

      const stageWidth =
        typeof stageNode.layout_target_width === "number"
          ? stageNode.layout_target_width
          : RHEMA_STAGE_WIDTH;
      const stageHeight =
        typeof stageNode.layout_target_height === "number"
          ? stageNode.layout_target_height
          : RHEMA_STAGE_HEIGHT;
      const stageRect = editor.getNodeAbsoluteBoundingRect(resolvedStageId);
      const stageX =
        stageRect?.x ??
        (typeof stageNode.layout_inset_left === "number"
          ? stageNode.layout_inset_left
          : 0);
      const stageY =
        stageRect?.y ??
        (typeof stageNode.layout_inset_top === "number"
          ? stageNode.layout_inset_top
          : 0);
      const inserted = editor.insert(
        {
          prototype: {
            type: "rectangle",
            name: `${mode}-placeholder`,
            locked: true,
            layout_positioning: "absolute",
            layout_inset_left: Math.round(stageX),
            layout_inset_top: Math.round(stageY),
            layout_target_width: stageWidth,
            layout_target_height: stageHeight,
            fill: {
              type: "solid",
              color: kolor.colorformats.RGBA32F.fromHEX("#00000000"),
              active: false,
            },
            fill_paints: [
              {
                type: "image",
                src: imageRef.url,
                fit: "cover",
                transform: cmath.transform.identity,
                filters: cg.def.IMAGE_FILTERS,
                blend_mode: cg.def.BLENDMODE,
                opacity: 0.75,
                active: true,
              } satisfies cg.ImagePaint,
            ],
          },
        },
        null
      );
      const previewNodeId = inserted[0] ?? null;
      if (previewNodeId) {
        editor.commands.changeNodePropertyPositioning(previewNodeId, {
          layout_positioning: "absolute",
          layout_inset_left: Math.round(stageX),
          layout_inset_top: Math.round(stageY),
        });
        editor.commands.changeNodeSize(previewNodeId, "width", stageWidth);
        editor.commands.changeNodeSize(previewNodeId, "height", stageHeight);
        editor.commands.order([previewNodeId], "back");
      }

      editor.setUserData(activeSceneId, {
        ...current,
        [RHEMA_SERVICE_REFERENCE_KEY]: mode,
        [RHEMA_SERVICE_REFERENCE_NODE_KEY]: previewNodeId,
      });
    },
    [activeSceneId, editor, isBibleHelper, stageId]
  );
  /**
   * Write the bundle name into every scene's userData. Grida has no
   * document-level userdata, so we replicate across scenes. Reading just
   * picks the first non-empty value (see useEditorState selector above).
   */
  const setBundleNameOnAllScenes = useCallback(
    (next: string | null) => {
      const trimmed = typeof next === "string" ? next.trim() : "";
      for (const sid of editor.state.document.scenes_ref) {
        const ud = (editor.getUserData(sid) ?? {}) as Record<string, unknown>;
        editor.setUserData(sid, {
          ...ud,
          [RHEMA_BUNDLE_NAME_KEY]: trimmed || null,
        });
      }
    },
    [editor]
  );

  // Slide-workspace name setter — renames the active scene directly
  // (vs. theme/stage which write a separate bundle-name userdata key).
  // Slide is single-scene by design, and BH reads imported.name from
  // the save payload to update slide.label everywhere downstream
  // (slot card, library entry, LiveScreen meta). One source of truth.
  const _setSlideName = useCallback(
    (next: string | null) => {
      if (!activeSceneId) return;
      const trimmed = typeof next === "string" ? next.trim() : "";
      // Empty input → fall back to "Untitled Slide" so the scene
      // always has a name (the editor + save-payload both require it).
      editor.commands.renameScene(activeSceneId, trimmed || "Untitled Slide");
    },
    [editor, activeSceneId]
  );

  const onCreateTheme = useCallback(() => {
    if (!isBibleHelper) {
      editor.surface.surfaceCreateScene();
      return;
    }

    const previousActiveSceneId = activeSceneId;
    const isStage = workspace === "stage";
    const isSlide = workspace === "slide";
    const newSceneId = `${isStage ? "stage" : isSlide ? "slide" : "theme"}-${v4()}`;
    const sceneNamePrefix = isStage ? "Stage" : isSlide ? "Slide" : "Theme";
    editor.surface.surfaceCreateScene({
      id: newSceneId,
      name: `${sceneNamePrefix} ${scenesCount + 1}`,
      background_color: RHEMA_SCENE_BACKGROUND,
    });
    // Explicitly switch to the new scene before inserting the stage
    // container — surfaceCreateScene's "make active" can race against
    // the synchronous insert below, leaving the stage container in
    // the OLD active scene (= blank canvas on the new slide,
    // operator report 2026-05-28).
    try {
      editor.commands.loadScene(newSceneId);
    } catch {
      /* non-fatal — the create above should have made it active */
    }

    const inserted = editor.commands.insert(
      {
        prototype: createRhemaStagePrototype(),
      },
      null
    );
    const stageId = inserted[0];
    const sceneUserData = (editor.getUserData(newSceneId) ?? {}) as Record<
      string,
      unknown
    >;
    editor.setUserData(newSceneId, {
      ...sceneUserData,
      rhema_profile: "bible-helper",
      rhema_lock_to_stage: true,
      rhema_stage_node_id: stageId,
      // Inherit the bundle name from existing scenes (read-and-mirror,
      // since bundle name is stored per-scene). Slide-workspace skips
      // this — each scene is a SLIDE with its own name (scene.name),
      // not a layout within a named bundle.
      ...(isSlide ? {} : { [RHEMA_BUNDLE_NAME_KEY]: bundleName }),
      // Stamp the workspace discriminator at the data layer so the
      // codex-recommended boundary holds — a stage scene saved into a
      // theme registry would be rejected by BH's parser.
      [RHEMA_WORKSPACE_KEY]: isStage ? "stage" : isSlide ? "slide" : "theme",
    });

    // First time the document goes from 1 → 2 scenes AND the operator
    // hasn't named the bundle yet — prompt them. This is the ProPresenter-
    // style trigger: adding a second layout implies "this is a bundle now".
    // Defer via setTimeout so the new scene commits before the prompt
    // blocks the main thread. Slides skip the bundle-name prompt — each
    // slide is named independently via the scene-list rename UI.
    if (!isSlide && scenesCount === 1 && !bundleName) {
      setTimeout(() => {
        const promptText = isStage
          ? "Name this stage bundle (e.g. Service Stage, Choir Stage):"
          : "Name this theme bundle (e.g. Baptism, Christmas Eve):";
        const proposed = window.prompt(promptText, "");
        if (proposed && proposed.trim()) {
          setBundleNameOnAllScenes(proposed);
        }
      }, 0);
    }

    // Keep the user's current active theme when creating a new one
    // (theme + stage). Slide-workspace lands the operator ON the new
    // slide so they can start designing immediately — "+ Add Slide"
    // means "add and switch to it".
    if (!isSlide && previousActiveSceneId) {
      editor.commands.loadScene(previousActiveSceneId);
    }
  }, [
    activeSceneId,
    bundleName,
    editor,
    isBibleHelper,
    scenesCount,
    setBundleNameOnAllScenes,
    workspace,
  ]);

  return (
    <aside className="relative">
      {showLibrary && (
        <div className="absolute top-4 -right-14 z-50">
          <Tooltip>
            <FloatingWindowTrigger
              windowId="library"
              controls={libraryWindowControls}
              asChild
            >
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="size-8 rounded-full p-0"
                  aria-label="Open Library"
                >
                  <PlusIcon className="size-4" aria-hidden />
                </Button>
              </TooltipTrigger>
            </FloatingWindowTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <div className="flex items-center gap-2">
                <span>Open Library</span>
                <KbdGroup>
                  <Kbd>{uikbdk(M.Shift)}</Kbd>
                  <Kbd>{uikbdk(KeyCode.KeyI)}</Kbd>
                </KbdGroup>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Sidebar>
        <SidebarHeader className="p-0">
          <DarwinSidebarHeaderDragArea />
          <header className="h-11 min-h-11 flex items-center px-4 border-b">
            {!isBibleHelper && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger className="me-2">
                  <GridaLogo className="inline-block size-4" />
                </DropdownMenuTrigger>
                <PlaygroundMenuContent
                  toggleVisibility={toggleVisibility}
                  toggleMinimal={toggleMinimal}
                />
              </DropdownMenu>
            )}
            <span className="font-bold text-xs">
              {isBibleHelper
                ? workspace === "stage"
                  ? "Stage Editor"
                  : workspace === "slide"
                    ? "Slide Editor"
                    : "Theme Editor"
                : "Canvas"}
              {!isBibleHelper && (
                <Badge variant="outline" className="ms-2 text-xs">
                  BETA
                </Badge>
              )}
            </span>
          </header>
        </SidebarHeader>
        <SidebarContent className="p-0 overflow-hidden flex flex-col">
          {/* DocumentHierarchy renders both the scene browser (top) and
              the Layers panel (bottom). Slide mode keeps both — the
              operator names the slide by renaming the scene, and uses
              the Layers panel to manage shape/text z-order. The "+ New"
              button is a no-op in slide mode because onCreateTheme
              early-returns (single-scene by design). */}
          <div className="flex-1 min-h-0">
            <DocumentHierarchy
              sceneLabel={
                isBibleHelper
                  ? workspace === "slide"
                    ? (bundleName ?? "Slide Show")
                    : (bundleName ??
                      (workspace === "stage" ? "Stage Layouts" : "Themes"))
                  : "Scenes"
              }
              newSceneLabel={
                isBibleHelper
                  ? workspace === "stage"
                    ? "New Stage Layout"
                    : workspace === "slide"
                      ? "New Slide"
                      : "New Theme"
                  : "New Scene"
              }
              onCreateScene={onCreateTheme}
              onSceneLabelChange={
                isBibleHelper ? setBundleNameOnAllScenes : undefined
              }
            />
          </div>
          {/* Stage layout templates — pick a preset and the editor
              seeds the active scene with its component set. Use on an
              empty scene right after creation; selecting on a scene
              that already has components ADDS to it (operator can
              delete extras manually). */}
          {isBibleHelper && activeSceneId && workspace === "stage" && (
            <details open className="border-t group">
              <summary className="px-3 py-2 cursor-pointer list-none flex items-center gap-1.5 select-none hover:bg-muted/40">
                <ChevronRightIcon className="size-3 transition-transform group-open:rotate-90 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Templates
                </span>
              </summary>
              <div className="px-3 pb-2">
                <select
                  className="w-full h-7 rounded border border-input bg-background px-2 text-xs"
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.currentTarget.value;
                    if (id) insertStageTemplate(id);
                    // Reset select to placeholder so the same template
                    // can be re-inserted without a re-open cycle.
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="" disabled>
                    Pick a template…
                  </option>
                  {STAGE_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id} title={t.description}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[10.5px] text-muted-foreground leading-snug">
                  Inserts every component from the template into the active
                  scene. Use on an empty layout for best results.
                </p>
              </div>
            </details>
          )}
          {/* Stage components palette moved to a floating top-center
              toolbar pill (see StageComponentsToolbar in
              ViewportRoot). The sidebar reclaims that vertical space
              for the Layers list. */}
          {isBibleHelper && workspace !== "slide" && (
            <details className="border-t group">
              <summary className="px-3 py-2 cursor-pointer list-none flex items-center gap-1.5 select-none hover:bg-muted/40">
                <ChevronRightIcon className="size-3 transition-transform group-open:rotate-90 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Service Reference
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center text-muted-foreground hover:text-foreground"
                      aria-label="Service reference information"
                      onClick={(e) => e.preventDefault()}
                    >
                      <InfoCircledIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={8}
                    className="max-w-72"
                  >
                    Use these toggles to preview your theme in a live service
                    scene. These references are preview-only and never included
                    in exported themes.
                  </TooltipContent>
                </Tooltip>
              </summary>
              <div className="px-3 pb-2 space-y-2">
                <label className="flex items-center justify-between text-xs">
                  <span>Preacher</span>
                  <Switch
                    checked={serviceReference === "preacher"}
                    onCheckedChange={(checked) =>
                      setServiceReference(checked ? "preacher" : null)
                    }
                  />
                </label>
                <label className="flex items-center justify-between text-xs">
                  <span>Singer</span>
                  <Switch
                    checked={serviceReference === "singer"}
                    onCheckedChange={(checked) =>
                      setServiceReference(checked ? "singer" : null)
                    }
                  />
                </label>
              </div>
            </details>
          )}
          {isBibleHelper && (
            <div className="px-3 py-2 border-t">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  {workspace === "stage"
                    ? "Stage Export"
                    : workspace === "slide"
                      ? "Slide"
                      : "Theme Export"}
                </span>
              </div>
              <div className="mt-2 space-y-2">
                <Button
                  type="button"
                  variant="default"
                  className="h-7 w-full text-xs"
                  onClick={
                    workspace === "slide"
                      ? // Slide mode always uses the bundle channel so the
                        // operator's mental model is uniform whether they
                        // have 1 slide or N. The bundle save writes N
                        // slides into a single library entry.
                        saveThemeBundleToBibleHelper
                      : workspace === "stage" || bundleName || scenesCount > 1
                        ? saveThemeBundleToBibleHelper
                        : saveThemeToBibleHelper
                  }
                >
                  {workspace === "slide"
                    ? scenesCount > 1
                      ? `Save (${scenesCount} slides)`
                      : "Save"
                    : workspace === "stage"
                      ? bundleName || scenesCount > 1
                        ? "Save Stage Bundle"
                        : "Save Stage Layout"
                      : bundleName || scenesCount > 1
                        ? "Save Theme Bundle"
                        : "Save Theme"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-7 w-full text-xs"
                  onClick={exportRhemaJson}
                >
                  Export Rhema JSON
                </Button>
              </div>
            </div>
          )}
        </SidebarContent>
      </Sidebar>
    </aside>
  );
}

function useArtboardListCondition() {
  const tool = useToolState();
  const { constraints } = useCurrentSceneState();
  const should_show_artboards_list =
    tool.type === "insert" &&
    tool.node === "container" &&
    constraints.children === "multiple";
  return should_show_artboards_list;
}

function PresenseAvatars() {
  const instance = useCurrentEditor();
  const cursors = useEditorState(instance, (state) => state.cursors);

  return (
    <div className="flex ms-0 -space-x-2 -mx-2">
      <PlayerAvatar
        type="local"
        colors={{
          ring: "",
          fill: "",
          text: "",
        }}
        zIndex={Object.keys(cursors).length + 1}
        avatar={{
          src: undefined,
          fallback: "ME",
        }}
      />
      {Object.values(cursors).map((cursor, i) => (
        <PlayerAvatar
          key={cursor.id}
          type={"remote"}
          colors={{
            ring: cursor.palette["400"],
            fill: cursor.palette["600"],
            text: cursor.palette["100"],
          }}
          zIndex={Object.keys(cursors).length - i}
          avatar={{
            src: undefined,
            fallback: "?",
          }}
          tooltip="Click to follow"
          onClick={() => {
            instance.surface.follow(cursor.id);
          }}
        />
      ))}
    </div>
  );
}

/**
 * Visibility-rule state for the currently-selected node, derived
 * independently of SidebarLeft. Powers the right-panel Programming tab.
 */
function useRhemaVisibilityState(editor: ReturnType<typeof useCurrentEditor>) {
  const data = useEditorState(editor, (state) => {
    const sceneId = state.scene_id;
    const selectedNodeId =
      state.selection.length === 1 ? state.selection[0] : null;
    const selectedNodeRaw = selectedNodeId
      ? state.document.nodes[selectedNodeId]
      : undefined;
    const selectedNodeName =
      (selectedNodeRaw && (selectedNodeRaw as { name?: string }).name) || null;
    const selectedNodeUserdata = selectedNodeId
      ? ((state.document.metadata?.[selectedNodeId]?.userdata as
          | Record<string, unknown>
          | undefined) ?? null)
      : null;
    const rawRule = selectedNodeUserdata?.[RHEMA_VISIBILITY_RULE_KEY];
    let rule: RhemaVisibilityRule | null = null;
    if (rawRule && typeof rawRule === "object") {
      const r = rawRule as Record<string, unknown>;
      const cond = r.condition;
      const src = r.sourceTextNodeId;
      if (
        (cond === "has-text" || cond === "is-empty") &&
        typeof src === "string" &&
        src.trim()
      ) {
        rule = { condition: cond, sourceTextNodeId: src };
      }
    }
    const sceneTextNodes: Array<{ id: string; name: string }> = [];
    if (sceneId) {
      const stack = [...(state.document.links?.[sceneId] ?? [])];
      while (stack.length > 0) {
        const id = stack.pop()!;
        const n = state.document.nodes[id];
        if (n && (n as { type?: string }).type === "tspan") {
          sceneTextNodes.push({
            id,
            name: (n as { name?: string }).name || "Text",
          });
        }
        const kids = state.document.links?.[id];
        if (kids?.length) stack.push(...kids);
      }
    }
    return { selectedNodeId, selectedNodeName, sceneTextNodes, rule };
  });

  const setRule = useCallback(
    (rule: RhemaVisibilityRule | null) => {
      const id =
        editor.state.selection.length === 1 ? editor.state.selection[0] : null;
      if (!id) return;
      const current = (editor.getUserData(id) ?? {}) as Record<string, unknown>;
      const next = { ...current };
      if (rule) next[RHEMA_VISIBILITY_RULE_KEY] = rule;
      else delete next[RHEMA_VISIBILITY_RULE_KEY];
      editor.setUserData(id, next);
    },
    [editor]
  );

  return { ...data, setRule };
}

/**
 * Stage-binding state (clock / next-layout text-node bindings) for the active
 * scene, derived independently of SidebarLeft so the right-panel Programming
 * tab needs no prop-threading. Mirrors useRhemaVisibilityState. Uses the same
 * rhema_binding_* userdata keys (rhema-contract.ts) the left sidebar used.
 */
function useRhemaStageBindings(editor: ReturnType<typeof useCurrentEditor>) {
  const data = useEditorState(editor, (state) => {
    const sceneId = state.scene_id;
    const sceneUserData = sceneId
      ? ((state.document.metadata?.[sceneId]?.userdata as
          | Record<string, unknown>
          | undefined) ?? {})
      : {};
    const clockRaw = sceneUserData[RHEMA_CLOCK_BINDING_KEY];
    const nextLayoutRaw = sceneUserData[RHEMA_NEXT_LAYOUT_BINDING_KEY];
    const activeClockNodeId =
      typeof clockRaw === "string" && clockRaw.trim() ? clockRaw : null;
    const activeNextLayoutNodeId =
      typeof nextLayoutRaw === "string" && nextLayoutRaw.trim()
        ? nextLayoutRaw
        : null;
    const sceneTextNodes: Array<{ id: string; name: string }> = [];
    if (sceneId) {
      const stack = [...(state.document.links?.[sceneId] ?? [])];
      while (stack.length > 0) {
        const id = stack.pop()!;
        const n = state.document.nodes[id];
        if (n && (n as { type?: string }).type === "tspan") {
          sceneTextNodes.push({
            id,
            name: (n as { name?: string }).name || "Text",
          });
        }
        const kids = state.document.links?.[id];
        if (kids?.length) stack.push(...kids);
      }
    }
    return { activeClockNodeId, activeNextLayoutNodeId, sceneTextNodes };
  });

  const setStageBinding = useCallback(
    (role: "clock" | "nextLayout", nodeId: string | null) => {
      const sceneId = editor.state.scene_id;
      if (!sceneId) return;
      const current = (editor.getUserData(sceneId) ?? {}) as Record<
        string,
        unknown
      >;
      const key =
        role === "clock"
          ? RHEMA_CLOCK_BINDING_KEY
          : RHEMA_NEXT_LAYOUT_BINDING_KEY;
      const next = { ...current };
      if (nodeId) next[key] = nodeId;
      else delete next[key];
      editor.setUserData(sceneId, next);
    },
    [editor]
  );

  return { ...data, setStageBinding };
}

function SidebarRight({
  variant = "sidebar",
  tab,
  setTab,
  isBibleHelper = false,
  workspace,
}: {
  variant?: "sidebar" | "floating";
  tab: "inspect" | "agent";
  setTab: (tab: "inspect" | "agent") => void;
  isBibleHelper?: boolean;
  workspace?: string;
}) {
  const should_show_artboards_list = useArtboardListCondition();
  const editor = useCurrentEditor();
  const [bhTab, setBhTab] = useState<"properties" | "programming">(
    "properties"
  );
  const vis = useRhemaVisibilityState(editor);
  const stageBindings = useRhemaStageBindings(editor);
  const show_artboards = !isBibleHelper && should_show_artboards_list;
  const AGENT_PANEL_WIDTH = "540px";

  return (
    <aside
      data-variant={variant}
      id="sidebar-right"
      className="relative data-[variant=floating]:absolute data-[variant=floating]:right-0"
      style={
        {
          "--sidebar-width": isBibleHelper
            ? "240px"
            : tab === "inspect"
              ? "240px"
              : AGENT_PANEL_WIDTH,
        } as React.CSSProperties
      }
    >
      <Sidebar
        side="right"
        variant={variant}
        className="
          group-data-[variant=floating]:h-[700px]
          group-data-[variant=floating]:pt-8 group-data-[variant=floating]:pb-4 group-data-[variant=floating]:pl-0 group-data-[variant=floating]:pr-4
          relative
        "
      >
        <SidebarHeader className="p-0 gap-0">
          <header className="flex h-11 px-2 justify-between items-center gap-2">
            <div className="flex-1">
              {!isBibleHelper && <PresenseAvatars />}
            </div>
            <div className="flex items-center">
              <Zoom
                className={cn(
                  WorkbenchUI.inputVariants({
                    variant: "input",
                    size: "xs",
                  }),
                  "w-auto"
                )}
              />
              {!isBibleHelper && <PreviewButton />}
            </div>
          </header>
          {!isBibleHelper && (
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "inspect" | "agent")}
            >
              <SidebarTabsList className="h-auto bg-transparent px-2 pb-2">
                <SidebarTabsTrigger value="inspect" size="xs">
                  Inspect
                </SidebarTabsTrigger>
                <SidebarTabsTrigger value="agent" size="xs">
                  Agent
                </SidebarTabsTrigger>
              </SidebarTabsList>
            </Tabs>
          )}
        </SidebarHeader>
        <hr />
        {show_artboards ? (
          <>
            <DialogPrimitive.Root open>
              <DialogPrimitive.Content className="h-full">
                <DialogPrimitive.Title className="sr-only">
                  Artboards
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Select an artboard to insert
                </DialogPrimitive.Description>
                <SidebarRoot>
                  <ArtboardsList />
                </SidebarRoot>
              </DialogPrimitive.Content>
            </DialogPrimitive.Root>
          </>
        ) : (
          <>
            {isBibleHelper ? (
              <>
                <Tabs
                  value={bhTab}
                  onValueChange={(v) =>
                    setBhTab(v as "properties" | "programming")
                  }
                >
                  <SidebarTabsList className="h-auto bg-transparent px-2 pb-2">
                    <SidebarTabsTrigger value="properties" size="xs">
                      Properties
                    </SidebarTabsTrigger>
                    <SidebarTabsTrigger value="programming" size="xs">
                      Programming
                    </SidebarTabsTrigger>
                  </SidebarTabsList>
                </Tabs>
                <SidebarContent className="gap-0">
                  {bhTab === "properties" ? (
                    // Text shadow + 3D text live in the standard Effects
                    // section now (one list, one row per effect; the 3D
                    // stack collapses to a single "3D Text" entry) — the
                    // former inline sections are retired (item 8,
                    // 2026-07-07).
                    <Selection
                      config={{ position: "off", developer: "off" }}
                      empty={
                        <div className="mt-4 mb-10">
                          <DocumentProperties />
                        </div>
                      }
                    />
                  ) : (
                    <div className="px-3 py-3 space-y-2 text-xs">
                      <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground mb-1">
                        Visibility
                      </div>
                      {workspace === "slide" ? (
                        <p className="text-muted-foreground leading-snug">
                          Visibility rules aren&apos;t used for slides.
                        </p>
                      ) : !vis.selectedNodeId ? (
                        <p className="text-muted-foreground leading-snug">
                          Select any layer (shape, image, text) on the canvas to
                          attach a visibility rule.
                        </p>
                      ) : vis.sceneTextNodes.length === 0 ? (
                        <p className="text-muted-foreground leading-snug">
                          Visibility rules need at least one text layer in the
                          scene to act as the trigger. Add a text layer (it can
                          stay empty) and select it as the rule&apos;s source.
                        </p>
                      ) : (
                        <>
                          <p className="text-muted-foreground leading-snug">
                            Show{" "}
                            <strong>
                              {vis.selectedNodeName ?? "this layer"}
                            </strong>{" "}
                            only when:
                          </p>
                          <select
                            className="w-full h-7 rounded border border-input bg-background px-2 text-xs"
                            value={vis.rule?.sourceTextNodeId ?? ""}
                            onChange={(e) => {
                              const src = e.currentTarget.value;
                              if (!src) {
                                vis.setRule(null);
                                return;
                              }
                              vis.setRule({
                                condition: vis.rule?.condition ?? "has-text",
                                sourceTextNodeId: src,
                              });
                            }}
                          >
                            <option value="">Always visible (no rule)</option>
                            {vis.sceneTextNodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.name}
                              </option>
                            ))}
                          </select>
                          {vis.rule && (
                            <select
                              className="w-full h-7 rounded border border-input bg-background px-2 text-xs"
                              value={vis.rule.condition}
                              onChange={(e) =>
                                vis.setRule({
                                  ...vis.rule!,
                                  condition: e.currentTarget
                                    .value as RhemaVisibilityCondition,
                                })
                              }
                            >
                              <option value="has-text">has text</option>
                              <option value="is-empty">is empty</option>
                            </select>
                          )}
                        </>
                      )}
                      {workspace === "stage" && (
                        <div className="mt-4">
                          <div className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground mb-1">
                            Stage Bindings
                          </div>
                          <label className="block">
                            <span className="text-muted-foreground">
                              Clock text node
                            </span>
                            <select
                              className="mt-1 w-full h-7 rounded border border-input bg-background px-2 text-xs"
                              value={stageBindings.activeClockNodeId ?? ""}
                              onChange={(e) =>
                                stageBindings.setStageBinding(
                                  "clock",
                                  e.currentTarget.value || null
                                )
                              }
                            >
                              <option value="">No binding</option>
                              {stageBindings.sceneTextNodes.map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block mt-2">
                            <span className="text-muted-foreground">
                              Next layout text node
                            </span>
                            <select
                              className="mt-1 w-full h-7 rounded border border-input bg-background px-2 text-xs"
                              value={stageBindings.activeNextLayoutNodeId ?? ""}
                              onChange={(e) =>
                                stageBindings.setStageBinding(
                                  "nextLayout",
                                  e.currentTarget.value || null
                                )
                              }
                            >
                              <option value="">No binding</option>
                              {stageBindings.sceneTextNodes.map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p className="mt-2 text-[10.5px] text-muted-foreground leading-snug">
                            Bind an existing text node to a live data source.
                            The bound text is replaced at runtime by BH&apos;s
                            operator console.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </SidebarContent>
              </>
            ) : (
              <SidebarContent
                className={cn("gap-0", tab === "agent" && "overflow-hidden")}
              >
                <Tabs
                  value={tab}
                  className={cn(tab === "agent" && "flex flex-col h-full")}
                >
                  <SidebarTabsContent value="inspect">
                    <Selection
                      empty={
                        <div className="mt-4 mb-10">
                          <DocumentProperties />
                        </div>
                      }
                    />
                  </SidebarTabsContent>
                  <SidebarTabsContent value="agent" className="min-h-0">
                    <AgentPanel className="h-full flex-1 min-h-0" />
                  </SidebarTabsContent>
                </Tabs>
              </SidebarContent>
            )}
          </>
        )}
      </Sidebar>
    </aside>
  );
}

function PathToolbarPosition({ children }: React.PropsWithChildren) {
  const cem = useContentEditModeMinimalState();

  if (cem?.type !== "vector" && cem?.type !== "width") return null;

  return (
    <div className="absolute bottom-24 left-0 right-0 flex items-center justify-center z-50 pointer-events-none">
      {children}
    </div>
  );
}

function BrushToolbarPosition({ children }: React.PropsWithChildren) {
  const tool = useToolState();

  if (!(tool.type === "brush" || tool.type === "eraser")) return null;

  return (
    <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="relative left-8">{children}</div>
    </div>
  );
}

function Hotkyes() {
  useEditorHotKeys();

  return <></>;
}
