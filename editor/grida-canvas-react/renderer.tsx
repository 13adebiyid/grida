"use client";

import React, { useContext, useEffect, useMemo } from "react";
import { useCurrentSceneState, useTransformState } from "./provider";
import { useCurrentEditor, useEditorState } from "./use-editor";
import { NodeElement } from "@/grida-canvas-react-renderer-dom/nodes/node";
import { domapi } from "../grida-canvas/backends/dom";
import { TransparencyGrid } from "@grida/transparency-grid/react";
import { useMeasure } from "@uidotdev/usehooks";
import kolor from "@grida/color";
import grida from "@grida/schema";
import cmath from "@grida/cmath";

type CustomComponent = React.ElementType;

const UserCustomTemplatesContext = React.createContext<
  Record<string, CustomComponent>
>({});

export function useUserCustomTemplates() {
  return useContext(UserCustomTemplatesContext);
}

export function UserCustomTemplatesProvider({
  children,
  templates,
}: React.PropsWithChildren<UserCustomTemplatesProps>) {
  return (
    <UserCustomTemplatesContext.Provider value={templates ?? {}}>
      {children}
    </UserCustomTemplatesContext.Provider>
  );
}

export interface UserCustomTemplatesProps {
  templates?: Record<string, CustomComponent>;
}

export interface StandaloneDocumentContentProps {
  /**
   * when primary, it sets the id of the view - this is essential for the editor to work
   * multiple primary contents will cause an error
   *
   * @deprecated FIXME: this needs to be removed and handled differently - do not rely on id.
   *
   * @default true
   */
  primary?: boolean;
}

export function StandaloneSceneContent({
  primary = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & StandaloneDocumentContentProps) {
  const { children_refs: children } = useCurrentSceneState();

  return (
    <div
      id={primary ? domapi.k.EDITOR_CONTENT_ELEMENT_ID : undefined}
      {...props}
    >
      {children?.map((id) => (
        <NodeElement key={id} node_id={id} />
      ))}
    </div>
  );
}

export function StandaloneRootNodeContent({
  primary = false,
  node_id,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  StandaloneDocumentContentProps & {
    node_id: string;
  }) {
  return (
    <div
      id={primary ? domapi.k.EDITOR_CONTENT_ELEMENT_ID : undefined}
      {...props}
    >
      <NodeElement
        node_id={node_id}
        override={{
          style: {
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            right: 0,
            width: "100%",
            height: "100%",
            overflow: "auto",
          },
        }}
      />
    </div>
  );
}

export function StandaloneSceneBackground({
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const instance = useCurrentEditor();
  const slice = useEditorState(instance, (state) => {
    const scene_id = state.scene_id!;
    const scene = state.document.nodes[
      scene_id
    ] as grida.program.nodes.SceneNode;
    const sceneUserData = state.document.metadata?.[scene_id]?.userdata as
      | Record<string, unknown>
      | undefined;
    const stageIdRaw = sceneUserData?.rhema_stage_node_id;
    const sceneChildren = state.document.links[scene_id] ?? [];
    const inferredStageId =
      sceneChildren.find((id) => {
        const node = state.document.nodes[id];
        return node?.type === "container" && node.name === "Canvas 1920x1080";
      }) ?? null;
    const stageId =
      typeof stageIdRaw === "string" ? stageIdRaw : inferredStageId;
    const stageNode = stageId
      ? (state.document.nodes[stageId] as grida.program.nodes.Node | undefined)
      : undefined;
    const stageRect =
      stageNode &&
      stageNode.type === "container" &&
      typeof stageNode.layout_inset_left === "number" &&
      typeof stageNode.layout_inset_top === "number" &&
      typeof stageNode.layout_target_width === "number" &&
      typeof stageNode.layout_target_height === "number"
        ? {
            x: stageNode.layout_inset_left,
            y: stageNode.layout_inset_top,
            width: stageNode.layout_target_width,
            height: stageNode.layout_target_height,
          }
        : null;
    return {
      backgroundColor: scene?.background_color,
      transform: state.transform,
      isRhemaScene:
        sceneUserData?.rhema_profile === "bible-helper" ||
        scene?.name?.startsWith("Theme "),
      isStageWorkspace: sceneUserData?.rhema_workspace === "stage",
      stageRect,
    };
  });
  const {
    backgroundColor,
    transform,
    isRhemaScene,
    isStageWorkspace,
    stageRect,
  } = slice;

  const cssBackgroundColor = useMemo(() => {
    if (!backgroundColor) return undefined;
    return kolor.colorformats.RGBA32F.intoCSSRGBA(backgroundColor);
  }, [backgroundColor]);

  const [visiblearea, { width, height }] = useMeasure();
  const stageViewportRect = useMemo(() => {
    if (!isRhemaScene || !stageRect) return null;

    const tl = cmath.vector2.transform([stageRect.x, stageRect.y], transform);
    const br = cmath.vector2.transform(
      [stageRect.x + stageRect.width, stageRect.y + stageRect.height],
      transform
    );

    return {
      left: Math.min(tl[0], br[0]),
      top: Math.min(tl[1], br[1]),
      width: Math.abs(br[0] - tl[0]),
      height: Math.abs(br[1] - tl[1]),
    };
  }, [isRhemaScene, stageRect, transform]);

  return (
    <div {...props}>
      <div
        ref={visiblearea}
        className="absolute inset-0 pointer-events-none overflow-hidden -z-10"
      >
        {isRhemaScene && stageViewportRect ? (
          <>
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ backgroundColor: "#808080" }}
            />
            <div
              className="absolute overflow-hidden"
              style={{
                left: stageViewportRect.left,
                top: stageViewportRect.top,
                width: stageViewportRect.width,
                height: stageViewportRect.height,
                border: "1px solid rgba(255,255,255,0.45)",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.22)",
              }}
            >
              <TransparencyGrid
                transform={transform}
                width={width ?? 0}
                height={height ?? 0}
              />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  backgroundColor: isStageWorkspace ? "#000000" : "#ffffff",
                }}
              />
            </div>
          </>
        ) : (
          <>
            {/* root bg - transparency grid */}
            <TransparencyGrid
              transform={transform}
              width={width ?? 0}
              height={height ?? 0}
            />
            {/* background color */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ backgroundColor: cssBackgroundColor }}
            />
          </>
        )}
      </div>
      {children}
    </div>
  );
}

export function Transformer({ children }: React.PropsWithChildren) {
  const { style } = useTransformState();

  return (
    <div
      style={{
        ...style,
        position: "absolute",
      }}
    >
      {children}
    </div>
  );
}

function useFitInitiallyEffect() {
  const editor = useCurrentEditor();
  const documentKey = useEditorState(editor, (state) => state.document_key);
  const sceneId = useEditorState(editor, (state) => state.scene_id);

  useEffect(() => {
    editor.camera.fit("<scene>");
  }, [documentKey, sceneId]);
}

/**
 * @deprecated
 * TODO: this should work in plugin-wise, without any react dependencies - like how canvas backend does on mount
 */
export function AutoInitialFitTransformer({
  children,
}: React.PropsWithChildren) {
  const { style } = useTransformState();

  useFitInitiallyEffect();

  return (
    <div
      style={{
        ...style,
        position: "absolute",
      }}
    >
      {children}
    </div>
  );
}
