import { describe, expect, it } from "vitest";
import { buildRhemaThemeRuntimeJson, stripTextFromSvg } from "./rhema-contract";

describe("stripTextFromSvg", () => {
  it("removes text and tspan nodes while preserving shape nodes", () => {
    const svg = `<svg><rect width="100" height="100"/><text x="10" y="10">Hello<tspan>World</tspan></text><circle cx="5" cy="5" r="2"/></svg>`;
    const out = stripTextFromSvg(svg);
    expect(out.includes("<rect")).toBe(true);
    expect(out.includes("<circle")).toBe(true);
    expect(out.includes("<text")).toBe(false);
    expect(out.includes("<tspan")).toBe(false);
  });

  it("keeps foreignObject nodes so non-text visuals are not dropped", () => {
    const svg = `<svg><foreignObject x="0" y="0" width="100" height="100"><div><rect width="10" height="10"/></div></foreignObject></svg>`;
    const out = stripTextFromSvg(svg);
    expect(out.includes("<foreignObject")).toBe(true);
  });
});

describe("buildRhemaThemeRuntimeJson", () => {
  it("inherits typography from ancestor text node when tspan has no local style", () => {
    const sceneId = "scene-1";
    const stageId = "stage-1";
    const textId = "text-1";
    const tspanId = "tspan-1";

    const document = {
      nodes: {
        [sceneId]: { id: sceneId, type: "scene", name: "Theme A" },
        [stageId]: {
          id: stageId,
          type: "container",
          name: "Canvas 1920x1080",
          layout_target_width: 1920,
          layout_target_height: 1080,
          fill: {
            type: "solid",
            color: { r: 0, g: 0, b: 0, a: 1 },
            active: true,
          },
        },
        [textId]: {
          id: textId,
          type: "text",
          name: "Scripture",
          layout_inset_left: 120,
          layout_inset_top: 180,
          layout_target_width: 1200,
          layout_target_height: 280,
          font_family: "Bebas Neue",
          font_size: 84,
          font_weight: 700,
          text_align: "center",
          line_height: 1.15,
          letter_spacing: 0.02,
          fill: {
            type: "solid",
            color: { r: 1, g: 1, b: 1, a: 1 },
            active: true,
          },
        },
        [tspanId]: {
          id: tspanId,
          type: "tspan",
          name: "Scripture",
          text: "For God so loved the world",
        },
      },
      links: {
        [sceneId]: [stageId, textId],
        [textId]: [tspanId],
        [stageId]: [],
        [tspanId]: [],
      },
      metadata: {
        [sceneId]: {
          userdata: {
            rhema_binding_scripture_node_id: tspanId,
          },
        },
      },
    } as unknown as Parameters<typeof buildRhemaThemeRuntimeJson>[0];

    const runtime = buildRhemaThemeRuntimeJson(document, sceneId);
    const layer = runtime.textLayers.find((entry) => entry.id === tspanId);
    expect(layer).toBeTruthy();
    expect(layer?.style.fontFamily).toBe("Bebas Neue");
    expect(layer?.style.fontSize).toBe(84);
    expect(layer?.style.fontWeight).toBe(700);
    expect(layer?.style.textAlign).toBe("center");
    expect(layer?.style.lineHeight).toBe(1.15);
    expect(layer?.style.letterSpacing).toBe(0.02);
    expect(layer?.style.color).toContain("rgba(");
  });
});
