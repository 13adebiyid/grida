"use client";

import React, { createContext, useContext } from "react";
import type { AnimationSample } from "@grida/animation";

const AnimationSampleContext = createContext<AnimationSample | null>(null);

export function AnimationSampleProvider({
  sample,
  children,
}: React.PropsWithChildren<{ sample: AnimationSample | null }>) {
  return (
    <AnimationSampleContext.Provider value={sample}>
      {children}
    </AnimationSampleContext.Provider>
  );
}

export function useAnimationNodeSample(nodeId: string) {
  const sample = useContext(AnimationSampleContext);
  return {
    values: sample?.values[nodeId],
    mediaActions:
      sample?.mediaActions.filter((action) => action.targetNodeId === nodeId) ??
      [],
    sceneVersion: sample?.sceneVersion ?? 0,
    buildIndex: sample?.buildIndex ?? 0,
  };
}

export function animationValuesToStyle(
  values: AnimationSample["values"][string] | undefined,
  baseTransform?: React.CSSProperties["transform"]
): React.CSSProperties {
  const transform = [
    baseTransform,
    values?.["translation-x"] !== undefined
      ? `translateX(${values["translation-x"]}px)`
      : undefined,
    values?.["translation-y"] !== undefined
      ? `translateY(${values["translation-y"]}px)`
      : undefined,
    values?.rotation !== undefined
      ? `rotate(${values.rotation}deg)`
      : undefined,
    values?.["scale-x"] !== undefined
      ? `scaleX(${values["scale-x"]})`
      : undefined,
    values?.["scale-y"] !== undefined
      ? `scaleY(${values["scale-y"]})`
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    ...(values?.opacity !== undefined ? { opacity: values.opacity } : {}),
    ...(transform ? { transform } : {}),
  };
}
