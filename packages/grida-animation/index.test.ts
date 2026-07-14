import { describe, expect, it } from "vitest";
import type grida from "../grida-canvas-schema";
import { evaluateAnimations, validateAnimationRepository } from "./index";

const clip = (
  overrides: Partial<grida.program.document.animation.Clip> = {}
): grida.program.document.animation.Clip => ({
  id: "enter",
  scene_id: "scene",
  target_node_id: "node",
  phase: "enter",
  trigger: "operator-advance",
  depends_on: [],
  order: 1,
  delay_seconds: 0,
  duration_seconds: 1,
  easing: "linear",
  fill: "forwards",
  iterations: 1,
  tracks: [{ property: "opacity", from: 0, to: 1 }],
  media_action: "none",
  media_value: 0,
  ...overrides,
});

describe("native animation evaluator", () => {
  it("rejects dependency cycles and missing targets", () => {
    const animations = {
      a: clip({ id: "a", target_node_id: "missing", depends_on: ["b"] }),
      b: clip({ id: "b", depends_on: ["a"] }),
    };
    const issues = validateAnimationRepository({
      nodes: {
        scene: { type: "scene" } as grida.program.nodes.SceneNode,
        node: { type: "rectangle" } as grida.program.nodes.RectangleNode,
      },
      animations,
    });
    expect(issues.map((issue) => issue.code)).toContain("ANIMATION_CYCLE");
    expect(issues.map((issue) => issue.code)).toContain(
      "ANIMATION_TARGET_MISSING"
    );
  });

  it("reconstructs the same frame for a late or hidden-window sample", () => {
    const animations = { enter: clip() };
    const clock = {
      sceneId: "scene",
      sceneVersion: 2,
      buildIndex: 1,
      sceneEpochMs: 1_000,
      buildEpochMs: 2_000,
      nowMs: 2_500,
    };
    const first = evaluateAnimations(animations, clock);
    const late = evaluateAnimations(animations, { ...clock });
    expect(first).toEqual(late);
    expect(first.values.node.opacity).toBe(0.5);
  });

  it("returns completed state after refresh and skips future builds", () => {
    const animations = {
      enter: clip(),
      later: clip({
        id: "later",
        target_node_id: "node-2",
        order: 2,
        fill: "both",
      }),
    };
    const sample = evaluateAnimations(animations, {
      sceneId: "scene",
      sceneVersion: 1,
      buildIndex: 1,
      sceneEpochMs: 0,
      buildEpochMs: 0,
      nowMs: 10_000,
    });
    expect(sample.values.node.opacity).toBe(1);
    expect(sample.values["node-2"].opacity).toBe(0);
  });

  it("evaluates dependency order independently of repository key order", () => {
    const animations = {
      a: clip({
        id: "a",
        target_node_id: "node-2",
        trigger: "after-previous",
        depends_on: ["z"],
        duration_seconds: 1,
      }),
      z: clip({ id: "z", duration_seconds: 1 }),
    };
    const sample = evaluateAnimations(animations, {
      sceneId: "scene",
      sceneVersion: 1,
      buildIndex: 1,
      sceneEpochMs: 0,
      buildEpochMs: 0,
      nowMs: 1_500,
    });
    expect(sample.values.node.opacity).toBe(1);
    expect(sample.values["node-2"].opacity).toBe(0.5);
  });
});
