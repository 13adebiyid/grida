"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { evaluateAnimations } from "@grida/animation";
import type { AnimationSample } from "@grida/animation";
import type { Editor } from "@/grida-canvas/editor";
import { useEditorState } from "@/grida-canvas-react/use-editor";

const now = () => performance.now();

export function useNativeAnimationPreview(instance: Editor) {
  const { sceneId, repository } = useEditorState(instance, (state) => ({
    sceneId: state.scene_id,
    repository: state.document.animations,
  }));
  const clips = useMemo(
    () =>
      Object.values(repository ?? {})
        .filter((clip) => clip.scene_id === sceneId)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [repository, sceneId]
  );
  const [sceneVersion, setSceneVersion] = useState(1);
  const [buildIndex, setBuildIndex] = useState(0);
  const [sceneEpochMs, setSceneEpochMs] = useState(now);
  const [buildEpochMs, setBuildEpochMs] = useState(now);
  const [nowMs, setNowMs] = useState(now);
  const [skipToEnd, setSkipToEnd] = useState(false);
  const priorSceneId = useRef(sceneId);

  useEffect(() => {
    if (priorSceneId.current === sceneId) return;
    priorSceneId.current = sceneId;
    const epoch = now();
    setSceneVersion((version) => version + 1);
    setBuildIndex(0);
    setSceneEpochMs(epoch);
    setBuildEpochMs(epoch);
    setNowMs(epoch);
    setSkipToEnd(false);
  }, [sceneId]);

  useEffect(() => {
    if (!sceneId || clips.length === 0 || skipToEnd) return;
    let frame = 0;
    const tick = () => {
      setNowMs(now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clips.length, sceneId, skipToEnd]);

  const restart = useCallback(() => {
    const epoch = now();
    setSceneVersion((version) => version + 1);
    setBuildIndex(0);
    setSceneEpochMs(epoch);
    setBuildEpochMs(epoch);
    setNowMs(epoch);
    setSkipToEnd(false);
  }, []);
  const advance = useCallback(() => {
    const maxBuild = Math.max(0, ...clips.map((clip) => clip.order));
    const epoch = now();
    setBuildIndex((index) => Math.min(maxBuild, index + 1));
    setBuildEpochMs(epoch);
    setNowMs(epoch);
    setSkipToEnd(false);
  }, [clips]);
  const skip = useCallback(() => {
    const maxBuild = Math.max(0, ...clips.map((clip) => clip.order));
    setBuildIndex(maxBuild);
    setNowMs(now());
    setSkipToEnd(true);
  }, [clips]);

  const sample = useMemo<AnimationSample | null>(() => {
    if (!sceneId || clips.length === 0) return null;
    return evaluateAnimations(repository, {
      sceneId,
      sceneVersion,
      buildIndex,
      sceneEpochMs,
      buildEpochMs,
      nowMs,
      skipToEnd,
    });
  }, [
    buildEpochMs,
    buildIndex,
    clips.length,
    nowMs,
    repository,
    sceneEpochMs,
    sceneId,
    sceneVersion,
    skipToEnd,
  ]);

  return {
    clips,
    sample,
    buildIndex,
    hasAnimations: clips.length > 0,
    restart,
    advance,
    skip,
  };
}

export function NativeAnimationInspector({
  instance,
  preview,
}: {
  instance: Editor;
  preview: ReturnType<typeof useNativeAnimationPreview>;
}) {
  const { sceneId, selection, nodes } = useEditorState(instance, (state) => ({
    sceneId: state.scene_id,
    selection: state.selection,
    nodes: state.document.nodes,
  }));
  const target = selection.length === 1 ? nodes[selection[0]!] : undefined;
  if (!sceneId) return null;

  const addBuild = () => {
    if (!target || target.type === "scene") return;
    const id = `animation_${crypto.randomUUID()}`;
    instance.doc.putAnimation({
      id,
      scene_id: sceneId,
      target_node_id: target.id,
      phase: "enter",
      trigger: "operator-advance",
      depends_on: [],
      order: Math.max(0, ...preview.clips.map((clip) => clip.order)) + 1,
      delay_seconds: 0,
      duration_seconds: 0.5,
      easing: "ease-out",
      fill: "forwards",
      iterations: 1,
      tracks: [{ property: "opacity", from: 0, to: 1 }],
      media_action: "none",
      media_value: 0,
    });
  };

  return (
    <section className="absolute right-3 top-3 z-50 w-80 max-h-[calc(100%-24px)] overflow-auto rounded-lg border bg-background/95 p-3 text-xs shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong>Builds</strong>
        <div className="flex gap-1">
          <button
            className="rounded border px-2 py-1"
            onClick={preview.restart}
          >
            Restart
          </button>
          <button
            className="rounded border px-2 py-1"
            onClick={preview.advance}
          >
            Advance {preview.buildIndex}
          </button>
          <button className="rounded border px-2 py-1" onClick={preview.skip}>
            End
          </button>
        </div>
      </div>
      <button
        className="mb-2 w-full rounded border px-2 py-1 disabled:opacity-40"
        disabled={!target || target.type === "scene"}
        onClick={addBuild}
      >
        Add build to selection
      </button>
      <div className="space-y-2">
        {preview.clips.map((clip) => (
          <div key={clip.id} className="rounded border p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate font-medium">
                {clip.target_node_id
                  ? (nodes[clip.target_node_id]?.name ?? clip.target_node_id)
                  : clip.phase}
              </span>
              <button
                aria-label="Delete build and dependent builds"
                className="rounded border px-1.5"
                onClick={() => instance.doc.deleteAnimation(clip.id, true)}
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label>
                Trigger
                <select
                  className="mt-1 w-full rounded border bg-background p-1"
                  value={clip.trigger}
                  onChange={(event) =>
                    instance.doc.changeAnimation(clip.id, {
                      trigger: event.target.value as typeof clip.trigger,
                    })
                  }
                >
                  <option value="scene-enter">Scene enter</option>
                  <option value="operator-advance">On advance</option>
                  <option value="with-previous">With previous</option>
                  <option value="after-previous">After previous</option>
                  <option value="explicit-cue">Explicit cue</option>
                </select>
              </label>
              <label>
                Easing
                <select
                  className="mt-1 w-full rounded border bg-background p-1"
                  value={clip.easing}
                  onChange={(event) =>
                    instance.doc.changeAnimation(clip.id, {
                      easing: event.target.value as typeof clip.easing,
                    })
                  }
                >
                  <option value="linear">Linear</option>
                  <option value="ease-in">Ease in</option>
                  <option value="ease-out">Ease out</option>
                  <option value="ease-in-out">Ease in/out</option>
                  <option value="step-start">Step start</option>
                  <option value="step-end">Step end</option>
                </select>
              </label>
              <NumberField
                label="Build order"
                value={clip.order}
                step={1}
                onChange={(order) =>
                  instance.doc.changeAnimation(clip.id, { order })
                }
              />
              <NumberField
                label="Delay (s)"
                value={clip.delay_seconds}
                step={0.05}
                onChange={(delay_seconds) =>
                  instance.doc.changeAnimation(clip.id, { delay_seconds })
                }
              />
              <NumberField
                label="Duration (s)"
                value={clip.duration_seconds}
                step={0.05}
                onChange={(duration_seconds) =>
                  instance.doc.changeAnimation(clip.id, { duration_seconds })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        className="mt-1 w-full rounded border bg-background p-1"
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}
