"use client";

import React from "react";
import { useCurrentEditor } from "@/grida-canvas-react";
import { PlusIcon } from "@radix-ui/react-icons";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScenesList } from "./tree-scene";
import { IsolationNodeHierarchyList } from "./tree-node";

/**
 * Inline-editable scene-group label. Read-only when no `onChange` is
 * provided (renders plain text). Double-click → edit mode; Enter or blur
 * commits; Esc cancels. Empty submissions are rejected (no commit).
 */
function EditableSceneLabel({
  value,
  onChange,
}: {
  value: string;
  onChange?: (next: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!onChange) {
    return <>{value}</>;
  }
  if (editing) {
    const commit = () => {
      const trimmed = draft.trim();
      if (trimmed && trimmed !== value) onChange(trimmed);
      setEditing(false);
    };
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        className="bg-transparent outline-none border-b border-foreground/30 px-0.5 -my-0.5 text-inherit w-full"
      />
    );
  }
  return (
    <span
      onDoubleClick={() => setEditing(true)}
      className="cursor-text select-none"
      title="Double-click to rename"
    >
      {value}
    </span>
  );
}

type SceneGroupLabels = {
  sceneLabel?: string;
  newSceneLabel?: string;
  onCreateScene?: () => void;
  /**
   * When provided, the scene-group label becomes inline-editable
   * (double-click to enter edit mode, Enter/blur to commit, Esc to
   * cancel). Used by the bible-helper integration so the operator can
   * name a theme bundle by renaming "Themes" → "Baptism" etc.
   */
  onSceneLabelChange?: (next: string) => void;
};

export function ScenesGroup({
  sceneLabel = "Scenes",
  newSceneLabel = "New Scene",
  onCreateScene,
}: SceneGroupLabels = {}) {
  const editor = useCurrentEditor();
  const createScene =
    onCreateScene ?? (() => editor.surface.surfaceCreateScene());

  return (
    <SidebarGroup
      onContextMenu={(e) => e.preventDefault()}
      className="min-h-16 max-h-56 overflow-y-auto"
    >
      <SidebarGroupLabel>
        {sceneLabel}
        <SidebarGroupAction onClick={createScene}>
          <PlusIcon />
          <span className="sr-only">{newSceneLabel}</span>
        </SidebarGroupAction>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <ScenesList />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function NodeHierarchyGroup() {
  return (
    <SidebarGroup className="flex-1" onContextMenu={(e) => e.preventDefault()}>
      <SidebarGroupLabel>Layers</SidebarGroupLabel>
      <SidebarGroupContent>
        <IsolationNodeHierarchyList />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function DocumentHierarchy({
  sceneLabel = "Scenes",
  newSceneLabel = "New Scene",
  onCreateScene,
  onSceneLabelChange,
}: SceneGroupLabels = {}) {
  const editor = useCurrentEditor();
  const createScene =
    onCreateScene ?? (() => editor.surface.surfaceCreateScene());

  return (
    <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
      <ResizablePanel defaultSize={"58%"} minSize={140} className="min-h-0">
        <SidebarGroup
          onContextMenu={(e) => e.preventDefault()}
          className="h-full flex flex-col min-h-0 p-0"
        >
          <div className="p-2">
            <SidebarGroupLabel>
              <EditableSceneLabel
                value={sceneLabel}
                onChange={onSceneLabelChange}
              />
              <SidebarGroupAction onClick={createScene}>
                <PlusIcon />
                <span className="sr-only">{newSceneLabel}</span>
              </SidebarGroupAction>
            </SidebarGroupLabel>
          </div>
          <SidebarGroupContent className="flex-1 min-h-0 overflow-y-auto px-2">
            <ScenesList />
          </SidebarGroupContent>
        </SidebarGroup>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel minSize={120} className="min-h-0">
        <SidebarGroup
          className="h-full flex flex-col min-h-0 p-0"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="p-2">
            <SidebarGroupLabel>Layers</SidebarGroupLabel>
          </div>
          <SidebarGroupContent className="flex-1 min-h-0 overflow-y-auto px-2">
            <IsolationNodeHierarchyList />
          </SidebarGroupContent>
        </SidebarGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export {
  NodeHierarchyList,
  IsolationNodeHierarchyList,
  type NodeHierarchyListProps,
} from "./tree-node";
