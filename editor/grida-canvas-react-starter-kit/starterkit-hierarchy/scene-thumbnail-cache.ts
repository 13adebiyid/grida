"use client";

import React from "react";

export type SceneThumbnail = { dataUrl: string; rev: number };

/**
 * In-memory, NON-persisted per-scene thumbnail cache. Owned by the
 * SceneThumbnailProvider; never serialized to disk (keeps the save/load
 * schema untouched).
 */
export class SceneThumbnailCache {
  private map = new Map<string, SceneThumbnail>();

  get(sceneId: string): SceneThumbnail | undefined {
    return this.map.get(sceneId);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
  has(sceneId: string): boolean {
    return this.map.has(sceneId);
  }
  /** Store/replace a scene's thumbnail (a PNG data URL), bumping its revision. */
  set(sceneId: string, dataUrl: string): SceneThumbnail {
    const prev = this.map.get(sceneId);
    const next: SceneThumbnail = { dataUrl, rev: (prev?.rev ?? 0) + 1 };
    this.map.set(sceneId, next);
    return next;
  }
  delete(sceneId: string): void {
    this.map.delete(sceneId);
  }
  /** Drop cache entries for scenes no longer present. */
  prune(validSceneIds: Iterable<string>): void {
    const valid = new Set(validSceneIds);
    for (const id of [...this.map.keys()])
      if (!valid.has(id)) this.map.delete(id);
  }
  /** Capture on first visit only when nothing is cached for the scene. */
  shouldCaptureOnVisit(sceneId: string): boolean {
    return !this.map.has(sceneId);
  }
}

type MinimalNode = {
  type?: string;
  name?: string;
  layout_target_width?: number;
  layout_target_height?: number;
};
type MinimalDocument = {
  links?: Record<string, string[]>;
  nodes: Record<string, MinimalNode | undefined>;
  metadata?: Record<string, { userdata?: Record<string, unknown> } | undefined>;
};

/** Mirrors playground.tsx's local isRhemaStageCandidate (not exported there). */
export function isRhemaStageCandidate(
  node: MinimalNode | undefined,
  stageName: string
): boolean {
  if (!node || node.type !== "container") return false;
  return (
    node.name === stageName ||
    (typeof node.layout_target_width === "number" &&
      typeof node.layout_target_height === "number" &&
      node.layout_target_width >= 1280 &&
      node.layout_target_height >= 720)
  );
}

/**
 * Resolve the renderable stage container node for a scene. exportNodeAs
 * throws on the scene root (wasm backend), so thumbnails must target the
 * stage. Prefer the explicit `rhema_stage_node_id` userdata, else the first
 * child that is a stage candidate. Returns null when none qualifies.
 */
export function resolveRhemaStageNodeId(
  document: MinimalDocument,
  sceneId: string,
  stageName: string
): string | null {
  const childIds = document.links?.[sceneId] ?? [];
  const ud = document.metadata?.[sceneId]?.userdata;
  const explicitRaw = ud?.["rhema_stage_node_id"];
  const explicitId = typeof explicitRaw === "string" ? explicitRaw : null;
  if (
    explicitId &&
    childIds.includes(explicitId) &&
    isRhemaStageCandidate(document.nodes[explicitId], stageName)
  ) {
    return explicitId;
  }
  return (
    childIds.find((id) =>
      isRhemaStageCandidate(document.nodes[id], stageName)
    ) ?? null
  );
}

export type SceneThumbnailContextValue = {
  getThumbnail: (sceneId: string) => SceneThumbnail | undefined;
  /** Bumps whenever any cached thumbnail changes, to re-render consumers. */
  version: number;
};

export const SceneThumbnailContext =
  React.createContext<SceneThumbnailContextValue | null>(null);

/** Consumer hook for a scene's thumbnail. Safe outside a provider (returns undefined). */
export function useSceneThumbnail(sceneId: string): SceneThumbnail | undefined {
  const ctx = React.useContext(SceneThumbnailContext);
  // `version` is read implicitly via context value identity changes.
  return ctx ? ctx.getThumbnail(sceneId) : undefined;
}
