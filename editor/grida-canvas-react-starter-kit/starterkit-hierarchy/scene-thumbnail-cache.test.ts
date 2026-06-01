import { describe, expect, it } from "vitest";
import {
  SceneThumbnailCache,
  isRhemaStageCandidate,
  resolveRhemaStageNodeId,
} from "./scene-thumbnail-cache";

const STAGE_NAME = "Canvas 1920x1080";

describe("SceneThumbnailCache", () => {
  it("set bumps rev and get returns the latest dataUrl", () => {
    const c = new SceneThumbnailCache();
    expect(c.get("s1")).toBeUndefined();
    expect(c.set("s1", "data:image/png;base64,AAAA").rev).toBe(1);
    expect(c.set("s1", "data:image/png;base64,BBBB").rev).toBe(2);
    expect(c.get("s1")).toEqual({
      dataUrl: "data:image/png;base64,BBBB",
      rev: 2,
    });
  });

  it("shouldCaptureOnVisit is true only when uncached", () => {
    const c = new SceneThumbnailCache();
    expect(c.shouldCaptureOnVisit("s1")).toBe(true);
    c.set("s1", "<svg/>");
    expect(c.shouldCaptureOnVisit("s1")).toBe(false);
  });

  it("delete removes a single entry", () => {
    const c = new SceneThumbnailCache();
    c.set("s1", "<svg/>");
    c.delete("s1");
    expect(c.has("s1")).toBe(false);
  });

  it("prune drops entries not in the valid set, keeps the rest", () => {
    const c = new SceneThumbnailCache();
    c.set("s1", "<svg/>");
    c.set("s2", "<svg/>");
    c.prune(["s2"]);
    expect(c.has("s1")).toBe(false);
    expect(c.has("s2")).toBe(true);
  });
});

describe("resolveRhemaStageNodeId", () => {
  const doc = (
    links: Record<string, string[]>,
    nodes: Record<string, any>,
    ud?: Record<string, any>
  ) => ({ links, nodes, metadata: ud ? { sc: { userdata: ud } } : {} }) as any;

  it("prefers a valid explicit rhema_stage_node_id from scene userdata", () => {
    const d = doc(
      { sc: ["stageA", "other"] },
      {
        stageA: { type: "container", name: STAGE_NAME },
        other: { type: "tspan" },
      },
      { rhema_stage_node_id: "stageA" }
    );
    expect(resolveRhemaStageNodeId(d, "sc", STAGE_NAME)).toBe("stageA");
  });

  it("falls back to the first child that is a stage candidate by size", () => {
    const d = doc(
      { sc: ["txt", "frame"] },
      {
        txt: { type: "tspan" },
        frame: {
          type: "container",
          layout_target_width: 1920,
          layout_target_height: 1080,
        },
      }
    );
    expect(resolveRhemaStageNodeId(d, "sc", STAGE_NAME)).toBe("frame");
  });

  it("returns null when no child qualifies", () => {
    const d = doc({ sc: ["txt"] }, { txt: { type: "tspan" } });
    expect(resolveRhemaStageNodeId(d, "sc", STAGE_NAME)).toBeNull();
  });

  it("isRhemaStageCandidate ignores small containers", () => {
    expect(
      isRhemaStageCandidate(
        {
          type: "container",
          layout_target_width: 100,
          layout_target_height: 100,
        } as any,
        STAGE_NAME
      )
    ).toBe(false);
  });
});
