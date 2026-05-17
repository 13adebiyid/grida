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
import { FontFamilyListProvider } from "@/scaffolds/sidecontrol/controls/font-family";
import { PlusIcon, Cross1Icon, InfoCircledIcon } from "@radix-ui/react-icons";
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
import { buildRhemaThemeRuntimeJson, stripTextFromSvg } from "./rhema-contract";

const RHEMA_SCENE_BACKGROUND = kolor.colorformats.RGBA32F.fromHEX("#00000000");
const RHEMA_STAGE_NAME = "Canvas 1920x1080";
const RHEMA_STAGE_WIDTH = 1920;
const RHEMA_STAGE_HEIGHT = 1080;
const RHEMA_SERVICE_REFERENCE_KEY = "rhema_service_reference";
const RHEMA_SERVICE_REFERENCE_NODE_KEY = "rhema_service_reference_node_id";
const RHEMA_SERVICE_REFERENCE_IMAGES = {
  preacher: "/images/preacher-placeholder.jpg",
  singer: "/images/lyrics-placeholder.jpg",
} as const;
const BIBLE_HELPER_THEME_SAVE_MESSAGE_TYPE = "bible-helper-theme-save";

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

function usePlaygroundDirtyFlag(instance: Editor, enabled: boolean) {
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
        setDirty(true);
      }
    );

    return unsubscribe;
  }, [enabled, instance]);

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
  const opfs = usePlaygroundOPFS(resolvedFilekey);
  const { dirty, markSaved } = usePlaygroundDirtyFlag(
    instance,
    warnOnUnsavedChanges
  );
  const [documentReady, setDocumentReady] = useState(() => !src);
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(
    null
  );
  const [errmsg, setErrmsg] = useState<string | null>(null);
  const [loadingOverlay, setLoadingOverlay] = useState(true);
  const handleCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasElement(node);
  }, []);

  useUnsavedChangesWarning(() => {
    if (!warnOnUnsavedChanges) return false;
    // Keep local dev convenient (previous behavior).
    // if (process.env.NODE_ENV === "development") return false;
    return dirty;
  });

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
            const bytes = await opfs.get("document.grida").read();
            if (bytes && !cancelled) {
              const loadedDocument = io.GRID.decode(bytes);

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
  }, [document, instance, src, opfs, backend]);

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
            <StandaloneDocumentEditor editor={instance}>
              <div className="w-full h-full flex flex-row">
                <SidebarProvider className="w-full h-full">
                  <main className="w-full h-full select-none relative">
                    <WindowGlobalCurrentEditorProvider />
                    <UserCustomTemplatesProvider templates={templates}>
                      <StarterKitOrgIdProvider organizationId={organizationId}>
                        <Consumer
                          backend={backend}
                          canvasRef={handleCanvasRef}
                          onSaved={markSaved}
                          filekey={resolvedFilekey}
                          initialSceneId={initialSceneId}
                          profile={profile}
                        />
                      </StarterKitOrgIdProvider>
                    </UserCustomTemplatesProvider>
                  </main>
                </SidebarProvider>
              </div>
            </StandaloneDocumentEditor>
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
}: {
  backend: "dom" | "canvas";
  canvasRef?: (canvas: HTMLCanvasElement | null) => void;
  onSaved: () => void;
  filekey: string;
  initialSceneId?: string;
  profile: "default" | "bible-helper";
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

    instance.setUserData(sceneMeta.id, {
      ...sceneUserData,
      rhema_profile: "bible-helper",
      rhema_lock_to_stage: true,
      rhema_stage_node_id: stageId,
    });
  }, [instance, isBibleHelper, sceneMeta]);

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

    if (needsPositioningUpdate) {
      instance.commands.changeNodePropertyPositioning(sceneMeta.stageId, {
        layout_positioning: "absolute",
        layout_inset_left: 0,
        layout_inset_top: 0,
      });
      instance.commands.changeNodeSize(
        sceneMeta.stageId,
        "width",
        RHEMA_STAGE_WIDTH
      );
      instance.commands.changeNodeSize(
        sceneMeta.stageId,
        "height",
        RHEMA_STAGE_HEIGHT
      );
    }

    if (stageNode.clips_content !== true) {
      instance.commands.changeContainerNodeClipsContent(
        sceneMeta.stageId,
        true
      );
    }
  }, [instance, isBibleHelper, sceneMeta]);

  useEffect(() => {
    if (!isBibleHelper || !sceneMeta) return;
    if (sceneMeta.childrenCount > 0) {
      instance.commands.changeSceneBackground(
        sceneMeta.id,
        RHEMA_SCENE_BACKGROUND
      );
      initializedRhemaSceneIdsRef.current.add(sceneMeta.id);
      return;
    }
    if (initializedRhemaSceneIdsRef.current.has(sceneMeta.id)) return;

    initializedRhemaSceneIdsRef.current.add(sceneMeta.id);
    instance.commands.changeSceneBackground(
      sceneMeta.id,
      RHEMA_SCENE_BACKGROUND
    );
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

    requestAnimationFrame(() => {
      instance.camera.fit("<scene>", { margin: 64 });
    });
  }, [instance, isBibleHelper, sceneMeta]);

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
        instance.commands.changeNodePropertyPositioning(nodeId, {
          layout_positioning: node.layout_positioning,
          layout_inset_left: Math.round(nextX),
          layout_inset_top: Math.round(nextY),
        });
      }
    }

    rhemaMigratedSceneIdsRef.current.add(sceneMeta.id);
  }, [instance, isBibleHelper, sceneMeta]);

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
          const snapshotJson = io.snapshot.stringify({
            version: undefined, // Version is optional in snapshot format
            document: dir.document,
          });
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
                <div className="flex w-full h-full">
                  {ui.sidebar_left && (
                    <SidebarLeft
                      toggleVisibility={toggleVisibility}
                      toggleMinimal={toggleMinimal}
                      libraryWindowControls={libraryWindowControls}
                      showLibrary={!isBibleHelper}
                      isBibleHelper={isBibleHelper}
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
                          {backend === "canvas" && <Canvas ref={canvasRef} />}
                          {backend === "dom" && (
                            <AutoInitialFitTransformer>
                              <StandaloneSceneContent />
                            </AutoInitialFitTransformer>
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
                    />
                  )}
                </div>
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

function Canvas({ ref }: { ref?: (canvas: HTMLCanvasElement | null) => void }) {
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

function SidebarLeft({
  toggleVisibility,
  toggleMinimal,
  libraryWindowControls,
  showLibrary = true,
  isBibleHelper = false,
}: {
  toggleVisibility?: () => void;
  toggleMinimal?: () => void;
  libraryWindowControls?: ReturnType<typeof useFloatingWindowControls>;
  showLibrary?: boolean;
  isBibleHelper?: boolean;
}) {
  const editor = useCurrentEditor();
  const { activeSceneId, scenesCount, serviceReference, stageId } =
    useEditorState(editor, (state) => {
      const sceneId = state.scene_id;
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
      const explicitStageId =
        typeof stageIdRaw === "string" ? stageIdRaw : null;
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

      return {
        activeSceneId: sceneId ?? null,
        scenesCount: state.document.scenes_ref.length,
        serviceReference,
        stageId,
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

  const saveThemeToBibleHelper = useCallback(async () => {
    if (!isBibleHelper || !activeSceneId) return;
    const payload = buildRhemaThemeRuntimeJson(
      editor.state.document,
      activeSceneId
    );
    try {
      const svgBytes = await editor.exportNodeAs(activeSceneId, "SVG", {
        format: "SVG",
      });
      const svgText =
        typeof svgBytes === "string"
          ? svgBytes
          : new TextDecoder().decode(svgBytes as AllowSharedBufferSource);
      payload.backdropSvg = stripTextFromSvg(svgText);
    } catch {
      payload.backdropSvg = null;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: BIBLE_HELPER_THEME_SAVE_MESSAGE_TYPE,
          payload,
        },
        "*"
      );
      toast.success(`Saved "${payload.scene.name}" to Bible Helper.`);
      return;
    }
    toast.error("Bible Helper parent window was not detected.");
  }, [activeSceneId, editor.state.document, isBibleHelper]);

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
  const onCreateTheme = useCallback(() => {
    if (!isBibleHelper) {
      editor.surface.surfaceCreateScene();
      return;
    }

    const previousActiveSceneId = activeSceneId;
    const newSceneId = `theme-${v4()}`;
    editor.surface.surfaceCreateScene({
      id: newSceneId,
      name: `Theme ${scenesCount + 1}`,
      background_color: RHEMA_SCENE_BACKGROUND,
    });

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
    });

    // Keep the user's current active theme when creating a new one.
    if (previousActiveSceneId) {
      editor.commands.loadScene(previousActiveSceneId);
    }
  }, [activeSceneId, editor, isBibleHelper, scenesCount]);

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
              {isBibleHelper ? "Rhema" : "Canvas"}
              {!isBibleHelper && (
                <Badge variant="outline" className="ms-2 text-xs">
                  BETA
                </Badge>
              )}
            </span>
          </header>
        </SidebarHeader>
        <SidebarContent className="p-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0">
            <DocumentHierarchy
              sceneLabel={isBibleHelper ? "Themes" : "Scenes"}
              newSceneLabel={isBibleHelper ? "New Theme" : "New Scene"}
              onCreateScene={onCreateTheme}
            />
          </div>
          {isBibleHelper && (
            <div className="px-3 py-2 border-t">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Service Reference
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center text-muted-foreground hover:text-foreground"
                      aria-label="Service reference information"
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
              </div>
              <div className="mt-2 space-y-2">
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
            </div>
          )}
          {isBibleHelper && (
            <div className="px-3 py-2 border-t">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
                  Theme Export
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center text-muted-foreground hover:text-foreground"
                      aria-label="Theme export information"
                    >
                      <InfoCircledIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={8}
                    className="max-w-72"
                  >
                    Bible mapping is now configured inside Bible Helper Themes
                    TEMP settings. Export this theme and manage
                    scripture/reference bindings there.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="mt-2 space-y-2">
                <Button
                  type="button"
                  variant="default"
                  className="h-7 w-full text-xs"
                  onClick={saveThemeToBibleHelper}
                >
                  Save Theme
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

function SidebarRight({
  variant = "sidebar",
  tab,
  setTab,
  isBibleHelper = false,
}: {
  variant?: "sidebar" | "floating";
  tab: "inspect" | "agent";
  setTab: (tab: "inspect" | "agent") => void;
  isBibleHelper?: boolean;
}) {
  const should_show_artboards_list = useArtboardListCondition();
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
              <SidebarContent className="gap-0">
                <Selection
                  config={{
                    position: "off",
                    developer: "off",
                  }}
                  empty={
                    <div className="mt-4 mb-10">
                      <DocumentProperties />
                    </div>
                  }
                />
              </SidebarContent>
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
