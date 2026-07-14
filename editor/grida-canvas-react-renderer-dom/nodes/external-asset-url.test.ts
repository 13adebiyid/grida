import { describe, expect, it } from "vitest";
import { resolveExternalAssetUrl } from "./external-asset-url";

const DIGEST = "a".repeat(64);

describe("resolveExternalAssetUrl", () => {
  it("maps portable image and video resources through the trusted host repository", () => {
    const locations = { [DIGEST]: `rhema-local://asset/${DIGEST}/clip.mp4` };
    expect(resolveExternalAssetUrl(locations, `res://videos/${DIGEST}`)).toBe(
      locations[DIGEST]
    );
    expect(resolveExternalAssetUrl(locations, `res://images/${DIGEST}`)).toBe(
      locations[DIGEST]
    );
  });

  it("does not expose an unresolved CAS URI to the browser", () => {
    expect(
      resolveExternalAssetUrl({}, `res://videos/${DIGEST}`)
    ).toBeUndefined();
  });

  it("preserves ordinary authored web URLs", () => {
    expect(resolveExternalAssetUrl({}, "https://cdn.example/video.mp4")).toBe(
      "https://cdn.example/video.mp4"
    );
  });
});
