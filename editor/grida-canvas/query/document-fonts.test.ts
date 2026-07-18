import { describe, expect, test } from "vitest";
import type grida from "@grida/schema";
import { dq } from ".";

describe("DocumentStateQuery fonts", () => {
  test("collects legacy spans and attributed text defaults and runs", () => {
    const document = {
      nodes: {
        legacy: { type: "tspan", font_family: "Inter" },
        imported: {
          type: "text",
          default_style: { font_family: "Aharoni" },
          styled_runs: [
            { style: { font_family: "Berlin Sans FBDemi" } },
            { style: { font_family: " Aharoni " } },
          ],
        },
      },
    } as unknown as grida.program.document.IDocumentDefinition;

    expect(new dq.DocumentStateQuery(document).fonts()).toEqual([
      "Inter",
      "Aharoni",
      "Berlin Sans FBDemi",
    ]);
  });
});
