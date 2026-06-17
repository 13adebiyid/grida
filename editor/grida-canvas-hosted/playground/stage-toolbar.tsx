"use client";

import { useCallback } from "react";
import { useCurrentEditor, useEditorState } from "@/grida-canvas-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import grida from "@grida/schema";
import {
  BookOpenTextIcon,
  BookmarkIcon,
  ChevronsRightIcon,
  Clock3Icon,
  TimerIcon,
  VideoIcon,
  MessageSquareIcon,
  StickyNoteIcon,
  MonitorPlayIcon,
  TypeIcon,
  Volume2Icon,
  HourglassIcon,
  ListIcon,
} from "lucide-react";
import { STAGE_COMPONENTS } from "./stage-components";
import type { RhemaComponentKind } from "./rhema-contract";

const RHEMA_STAGE_NAME = "Canvas 1920x1080";
const RHEMA_STAGE_WIDTH = 1920;
const RHEMA_STAGE_HEIGHT = 1080;
const RHEMA_COMPONENT_KIND_KEY = "rhema_component_kind";

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
      color: { r: 0, g: 0, b: 0, a: 0 },
      active: true,
    },
    stroke_width: 1,
    stroke_align: "inside",
  };
}

const STAGE_COMPONENT_ICONS: Record<
  RhemaComponentKind,
  React.ComponentType<{ className?: string }>
> = {
  scripture: BookOpenTextIcon,
  reference: BookmarkIcon,
  "next-up": ChevronsRightIcon,
  "next-slide-text": TypeIcon,
  clock: Clock3Icon,
  "segment-timer": TimerIcon,
  "segment-title": ListIcon,
  "video-countdown": VideoIcon,
  "audio-countdown": Volume2Icon,
  "preshow-countdown": HourglassIcon,
  "stage-message": MessageSquareIcon,
  "slide-notes": StickyNoteIcon,
  "screen-preview": MonitorPlayIcon,
};

export function StageComponentsToolbar() {
  const editor = useCurrentEditor();
  const activeSceneId = useEditorState(
    editor,
    (state) => state.scene_id ?? null
  );

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

  const insertStageComponent = useCallback(
    (kind: RhemaComponentKind) => {
      if (!activeSceneId) return;
      const spec = STAGE_COMPONENTS.find((c) => c.kind === kind);
      if (!spec) return;
      const parentId = ensureStageContainerId();
      if (!parentId) return;
      const proto = spec.prototype() as Record<string, unknown>;
      const inserted = editor.commands.insert(
        { prototype: proto as grida.program.nodes.NodePrototype },
        parentId
      );
      const newNodeId = inserted[0];
      if (!newNodeId) return;
      // Defeat Grida's viewport-relative smart-placement offset.
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
        [RHEMA_COMPONENT_KIND_KEY]: kind,
      });
      try {
        editor.commands.select([newNodeId]);
      } catch {
        /* non-fatal */
      }
    },
    [activeSceneId, editor, ensureStageContainerId]
  );

  if (!activeSceneId) return null;

  return (
    <div className="absolute top-5 left-0 right-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="rounded-full flex items-center gap-1 border bg-background shadow px-3 py-1.5 pointer-events-auto select-none">
        {STAGE_COMPONENTS.map((spec) => {
          const Icon = STAGE_COMPONENT_ICONS[spec.kind];
          return (
            <Tooltip key={spec.kind}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full"
                  aria-label={spec.label}
                  onClick={() => insertStageComponent(spec.kind)}
                >
                  <Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                <div className="text-xs">
                  <div className="font-medium">{spec.label}</div>
                  <div className="text-muted-foreground">
                    {spec.description}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
