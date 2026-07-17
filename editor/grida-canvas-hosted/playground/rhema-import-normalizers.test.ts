import { describe, expect, test } from "vitest";
import { suppressImportedContentMarkings } from "./rhema-import-normalizers";

describe("imported document normalizers", () => {
  test("hides Office content markings without removing authored text", () => {
    const document = {
      nodes: {
        body: { type: "text", name: "Prayer", text: "Father, turn every cell" },
        marking: {
          type: "text",
          name: "MSIPCMContentMarking",
          text: "External use permitted",
        },
      },
      links: { scene: ["body", "marking"] },
    };
    const normalized = suppressImportedContentMarkings(document);
    expect(normalized.nodes.body).toBe(document.nodes.body);
    expect(normalized.nodes.marking).toEqual({
      ...document.nodes.marking,
      active: false,
    });
    expect(normalized.links).toBe(document.links);
  });

  test("returns the original document when no marking exists", () => {
    const document = { nodes: { title: { type: "text", text: "PRAYER 4" } } };
    expect(suppressImportedContentMarkings(document)).toBe(document);
  });
});
