import { describe, expect, it } from "vitest";
import { isHostManagedImageRef } from "./external-asset-policy";

const digest = "a".repeat(64);
const externalImage = {
  digest,
  kind: "image" as const,
  mime_type: "image/png",
  display_name: "Photo.png",
  bytes: 123,
};

describe("isHostManagedImageRef", () => {
  it("keeps valid host-CAS images out of the document archive", () => {
    expect(
      isHostManagedImageRef(
        { external_assets: { [digest]: externalImage } },
        digest
      )
    ).toBe(true);
  });

  it("does not discard bytes for absent, mismatched, or non-image metadata", () => {
    expect(isHostManagedImageRef({}, digest)).toBe(false);
    expect(
      isHostManagedImageRef(
        {
          external_assets: {
            [digest]: { ...externalImage, digest: "b".repeat(64) },
          },
        },
        digest
      )
    ).toBe(false);
    expect(
      isHostManagedImageRef(
        {
          external_assets: {
            [digest]: { ...externalImage, kind: "video" },
          },
        },
        digest
      )
    ).toBe(false);
  });
});
