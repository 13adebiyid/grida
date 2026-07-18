import { describe, expect, test } from "vitest";
import type { GoogleWebFontListItem } from "@grida/fonts/google";
import {
  findPreferredMissingFamilyFallback,
  withMissingFamilyFallbacks,
} from "./bible-helper-local-fonts";

function item(family: string, url: string): GoogleWebFontListItem {
  return {
    category: "system",
    family,
    variants: ["regular", "700"],
    files: { regular: url, "700": `${url}-bold` },
    subsets: ["latin"],
    version: "local",
    lastModified: "",
    menu: url,
  };
}

describe("Bible Helper local font fallbacks", () => {
  test("selects the same installed serif fallback used by browser output", () => {
    const times = item("Times New Roman", "rhema-font://times");
    expect(
      findPreferredMissingFamilyFallback([item("Inter", "inter"), times])
    ).toBe(times);
  });

  test("returns null when the platform fallback is unavailable", () => {
    expect(
      findPreferredMissingFamilyFallback([item("Inter", "inter")])
    ).toBeNull();
  });

  test("aliases the CSS serif fallback bytes under missing imported families", () => {
    const times = item("Times New Roman", "rhema-font://times");
    const result = withMissingFamilyFallbacks(
      [times],
      ["Aharoni", "Berlin Sans FBDemi"]
    );
    expect(result.map(({ family }) => family)).toEqual([
      "Times New Roman",
      "Aharoni",
      "Berlin Sans FBDemi",
    ]);
    expect(result[1].files.regular).toBe(times.files.regular);
    expect(result[1].files["700"]).toBe(times.files["700"]);
  });

  test("keeps installed source families and creates no duplicate alias", () => {
    const times = item("Times", "rhema-font://times");
    const aharoni = item("Aharoni", "rhema-font://aharoni");
    const result = withMissingFamilyFallbacks(
      [times, aharoni],
      ["aharoni", "Aharoni"]
    );
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(aharoni);
  });

  test("does nothing when no compatible local serif face is available", () => {
    const result = withMissingFamilyFallbacks(
      [item("Arial", "rhema-font://arial")],
      ["Missing Font"]
    );
    expect(result.map(({ family }) => family)).toEqual(["Arial"]);
  });
});
