import { describe, expect, test } from "vitest";
import { rhemaDocumentAuthority } from "./rhema-document-authority";

describe("Rhema editor document authority", () => {
  test("canonical native sessions bypass a stale OPFS document", () => {
    expect(rhemaDocumentAuthority(true)).toBe("host-canonical");
  });

  test("legacy and non-native sessions retain OPFS persistence", () => {
    expect(rhemaDocumentAuthority(false)).toBe("opfs-cache");
  });
});
