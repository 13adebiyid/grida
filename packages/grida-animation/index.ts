import type grida from "../grida-canvas-schema";

export const ANIMATION_EVALUATOR_VERSION = "1.0.0";
export const MAX_ANIMATION_CLIPS = 10_000;
export const MAX_DEPENDENCIES_PER_CLIP = 64;
export const MAX_TRACKS_PER_CLIP = 32;
export const MAX_ANIMATION_SECONDS = 86_400;
export const MAX_ANIMATION_ITERATIONS = 10_000;

type Clip = grida.program.document.animation.Clip;
type Repository = grida.program.document.animation.Repository;
type Property = grida.program.document.animation.Property;

export interface AnimationValidationIssue {
  code:
    | "ANIMATION_LIMIT_EXCEEDED"
    | "ANIMATION_ID_MISMATCH"
    | "ANIMATION_SCENE_MISSING"
    | "ANIMATION_TARGET_MISSING"
    | "ANIMATION_DEPENDENCY_MISSING"
    | "ANIMATION_DEPENDENCY_SCOPE_INVALID"
    | "ANIMATION_SELF_DEPENDENCY"
    | "ANIMATION_CYCLE"
    | "ANIMATION_TRACK_DUPLICATE"
    | "ANIMATION_NUMBER_INVALID";
  clipId?: string;
  message: string;
}

export interface LogicalAnimationClock {
  sceneId: string;
  sceneVersion: number;
  buildIndex: number;
  sceneEpochMs: number;
  buildEpochMs: number;
  nowMs: number;
  skipToEnd?: boolean;
}

export interface AnimationSample {
  sceneId: string;
  sceneVersion: number;
  buildIndex: number;
  values: Record<string, Partial<Record<Property, number>>>;
  mediaActions: Array<{
    clipId: string;
    targetNodeId: string;
    action: Exclude<grida.program.document.animation.MediaAction, "none">;
    value: number;
  }>;
}

export function validateAnimationRepository(
  document: Pick<grida.program.document.Document, "nodes" | "animations">
): AnimationValidationIssue[] {
  const repository = document.animations ?? {};
  const clips = Object.values(repository);
  const issues: AnimationValidationIssue[] = [];
  if (clips.length > MAX_ANIMATION_CLIPS) {
    issues.push({
      code: "ANIMATION_LIMIT_EXCEEDED",
      message: `animation repository exceeds ${MAX_ANIMATION_CLIPS} clips`,
    });
    return issues;
  }
  for (const [key, clip] of Object.entries(repository)) {
    if (key !== clip.id) {
      issues.push({
        code: "ANIMATION_ID_MISMATCH",
        clipId: clip.id,
        message: "animation repository key does not match clip id",
      });
    }
    if (document.nodes[clip.scene_id]?.type !== "scene") {
      issues.push({
        code: "ANIMATION_SCENE_MISSING",
        clipId: clip.id,
        message: "animation scene target is missing",
      });
    }
    if (clip.target_node_id && !document.nodes[clip.target_node_id]) {
      issues.push({
        code: "ANIMATION_TARGET_MISSING",
        clipId: clip.id,
        message: "animation node target is missing",
      });
    }
    if (
      clip.depends_on.length > MAX_DEPENDENCIES_PER_CLIP ||
      clip.tracks.length > MAX_TRACKS_PER_CLIP
    ) {
      issues.push({
        code: "ANIMATION_LIMIT_EXCEEDED",
        clipId: clip.id,
        message: "animation dependency or track limit exceeded",
      });
    }
    const numbers = [
      clip.order,
      clip.delay_seconds,
      clip.duration_seconds,
      clip.iterations,
      clip.media_value,
      ...clip.tracks.flatMap((track) => [track.from, track.to]),
    ];
    if (
      numbers.some((value) => !Number.isFinite(value)) ||
      clip.order < 0 ||
      clip.delay_seconds < 0 ||
      clip.duration_seconds < 0 ||
      clip.delay_seconds > MAX_ANIMATION_SECONDS ||
      clip.duration_seconds > MAX_ANIMATION_SECONDS ||
      !Number.isSafeInteger(clip.order) ||
      !Number.isSafeInteger(clip.iterations) ||
      clip.iterations < 1 ||
      clip.iterations > MAX_ANIMATION_ITERATIONS
    ) {
      issues.push({
        code: "ANIMATION_NUMBER_INVALID",
        clipId: clip.id,
        message: "animation timing or track value is invalid",
      });
    }
    if (
      new Set(clip.tracks.map((track) => track.property)).size !==
      clip.tracks.length
    ) {
      issues.push({
        code: "ANIMATION_TRACK_DUPLICATE",
        clipId: clip.id,
        message: "animation contains more than one track for the same property",
      });
    }
    for (const dependency of clip.depends_on) {
      if (dependency === clip.id) {
        issues.push({
          code: "ANIMATION_SELF_DEPENDENCY",
          clipId: clip.id,
          message: "animation cannot depend on itself",
        });
      } else if (!repository[dependency]) {
        issues.push({
          code: "ANIMATION_DEPENDENCY_MISSING",
          clipId: clip.id,
          message: `animation dependency '${dependency}' is missing`,
        });
      } else if (
        repository[dependency].scene_id !== clip.scene_id ||
        repository[dependency].order > clip.order
      ) {
        issues.push({
          code: "ANIMATION_DEPENDENCY_SCOPE_INVALID",
          clipId: clip.id,
          message:
            "animation dependency must be in the same scene and cannot be a future build",
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id) || !repository[id]) return false;
    visiting.add(id);
    const cyclic = repository[id].depends_on.some(visit);
    visiting.delete(id);
    visited.add(id);
    return cyclic;
  };
  for (const clip of clips) {
    if (visit(clip.id)) {
      issues.push({
        code: "ANIMATION_CYCLE",
        clipId: clip.id,
        message: "animation dependency graph contains a cycle",
      });
      break;
    }
  }
  return issues;
}

function eased(value: number, easing: Clip["easing"]): number {
  const t = Math.max(0, Math.min(1, value));
  switch (easing) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "step-start":
      return t > 0 ? 1 : 0;
    case "step-end":
      return t >= 1 ? 1 : 0;
    default:
      return t;
  }
}

function clockForClip(clip: Clip, clock: LogicalAnimationClock): number | null {
  if (clock.skipToEnd) return Number.POSITIVE_INFINITY;
  if (clip.trigger === "scene-enter") return clock.nowMs - clock.sceneEpochMs;
  if (clip.order < clock.buildIndex) return Number.POSITIVE_INFINITY;
  if (clip.order > clock.buildIndex) return null;
  return clock.nowMs - clock.buildEpochMs;
}

export function evaluateAnimations(
  repository: Repository | undefined,
  clock: LogicalAnimationClock
): AnimationSample {
  const values: AnimationSample["values"] = {};
  const mediaActions: AnimationSample["mediaActions"] = [];
  const clips = Object.values(repository ?? {})
    .filter((clip) => clip.scene_id === clock.sceneId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  const orderedClips: Clip[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (clip: Clip) => {
    if (visited.has(clip.id) || visiting.has(clip.id)) return;
    visiting.add(clip.id);
    for (const dependency of clip.depends_on) {
      const dependencyClip = byId.get(dependency);
      if (dependencyClip) visit(dependencyClip);
    }
    visiting.delete(clip.id);
    visited.add(clip.id);
    orderedClips.push(clip);
  };
  clips.forEach(visit);
  const completion = new Map<string, number>();

  for (const clip of orderedClips) {
    const rootClock = clockForClip(clip, clock);
    if (rootClock === null) continue;
    const dependencyOffset = clip.depends_on.reduce((latest, dependency) => {
      const dependencyClip = byId.get(dependency);
      const prior = completion.get(dependency) ?? 0;
      return clip.trigger === "after-previous" &&
        dependencyClip?.order === clip.order
        ? Math.max(latest, prior)
        : latest;
    }, 0);
    const start = dependencyOffset + clip.delay_seconds * 1000;
    const singleDuration = clip.duration_seconds * 1000;
    const totalDuration = singleDuration * Math.max(1, clip.iterations);
    completion.set(clip.id, start + totalDuration);
    const elapsed = rootClock - start;
    const before = elapsed < 0;
    const complete = elapsed >= totalDuration || !Number.isFinite(rootClock);
    const samplesBefore = clip.fill === "backwards" || clip.fill === "both";
    const samplesAfter = clip.fill === "forwards" || clip.fill === "both";
    if ((before && !samplesBefore) || (complete && !samplesAfter)) continue;
    const iterationElapsed =
      singleDuration <= 0
        ? singleDuration
        : Math.max(0, elapsed) % singleDuration;
    const progress = complete
      ? 1
      : before
        ? 0
        : singleDuration <= 0
          ? 1
          : eased(iterationElapsed / singleDuration, clip.easing);
    if (clip.target_node_id) {
      const target = (values[clip.target_node_id] ??= {});
      for (const track of clip.tracks) {
        target[track.property] =
          track.from + (track.to - track.from) * progress;
      }
      if (
        clip.media_action !== "none" &&
        !before &&
        (complete || progress >= 0)
      ) {
        mediaActions.push({
          clipId: clip.id,
          targetNodeId: clip.target_node_id,
          action: clip.media_action,
          value: clip.media_value,
        });
      }
    }
  }

  return {
    sceneId: clock.sceneId,
    sceneVersion: clock.sceneVersion,
    buildIndex: clock.buildIndex,
    values,
    mediaActions,
  };
}
