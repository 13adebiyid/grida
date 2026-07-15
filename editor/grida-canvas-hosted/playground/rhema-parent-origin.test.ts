import { describe, expect, it } from "vitest";
import { validateRhemaParentOrigin } from "./rhema-parent-origin";

describe("validateRhemaParentOrigin", () => {
  it("preserves the existing http(s) host bridge contract", () => {
    expect(
      validateRhemaParentOrigin(
        "https://operator.example/path?ignored=1",
        "https://editor.example"
      )
    ).toBe("https://operator.example");
    expect(
      validateRhemaParentOrigin(
        "http://localhost:5173/graphics",
        "http://localhost:3210"
      )
    ).toBe("http://localhost:5173");
  });

  it("accepts a packaged custom-scheme parent only at the editor's exact origin", () => {
    expect(
      validateRhemaParentOrigin("rhema-app://app", "rhema-app://app")
    ).toBe("rhema-app://app");
  });

  it("rejects a different authority on the packaged custom scheme", () => {
    expect(
      validateRhemaParentOrigin("rhema-app://evil", "rhema-app://app")
    ).toBeUndefined();
  });

  it("rejects opaque or malformed custom origins", () => {
    expect(
      validateRhemaParentOrigin("file:///tmp/host.html", "null")
    ).toBeUndefined();
    expect(
      validateRhemaParentOrigin("not a url", "rhema-app://app")
    ).toBeUndefined();
  });
});
