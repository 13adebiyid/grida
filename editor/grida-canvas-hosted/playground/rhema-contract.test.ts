import { describe, expect, it } from "vitest";
import {
  buildRhemaThemeRuntimeJson,
  materializeRhemaThemeDocument,
  stripTextFromSvg,
  type RhemaThemeRuntimeJson,
} from "./rhema-contract";

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

describe("materializeRhemaThemeDocument (inverse of buildRhemaThemeRuntimeJson)", () => {
  const theme: RhemaThemeRuntimeJson = {
    kind: "rhema-theme-runtime",
    version: 1,
    scene: { id: "main", name: "My Theme" },
    stage: { width: 1920, height: 1080 },
    stageBackgroundColor: "rgba(10, 20, 30, 1.000)",
    backgroundVideo: null,
    backdropSvg: null,
    bindings: {
      scriptureNodeId: "scripture",
      referenceNodeId: "reference",
      includeVersionInReference: false,
    },
    textLayers: [
      {
        id: "scripture",
        name: "Scripture",
        text: "For God so loved the world",
        role: "scripture",
        componentKind: null,
        style: {
          color: "rgba(255, 255, 255, 1.000)",
          fontFamily: "Bebas Neue",
          fontSize: 84,
          fontWeight: 700,
          fontStyle: "normal",
          lineHeight: 1.2,
          letterSpacing: 0.02,
          textAlign: "center",
          strokeColor: "rgba(0, 0, 0, 1.000)",
          strokeWidth: 2,
          textShadow: "2px 2px 4px rgba(0, 0, 0, 0.500)",
          css: null,
        },
        frame: { x: 160, y: 300, width: 1600, height: 480 },
      },
      {
        id: "reference",
        name: "Reference",
        text: "John 3:16",
        role: "reference",
        componentKind: null,
        style: {
          color: "#d8dde6",
          fontFamily: null,
          fontSize: 40,
          fontWeight: 500,
          fontStyle: "italic",
          lineHeight: 1.2,
          letterSpacing: null,
          textAlign: "center",
          strokeColor: null,
          strokeWidth: null,
          textShadow: null,
          css: null,
        },
        frame: { x: 160, y: 812, width: 1600, height: null },
      },
    ],
    visibilityRules: {},
    workspace: "theme",
    stageBindings: { clockNodeId: null, nextLayoutNodeId: null },
    effectLayers: [],
  };

  it("round-trips stage, bindings, and workspace through the extractor", () => {
    const { document, sceneId } = materializeRhemaThemeDocument(theme);
    const rt = buildRhemaThemeRuntimeJson(document, sceneId);

    expect(rt.stage).toEqual({ width: 1920, height: 1080 });
    expect(rt.bindings.scriptureNodeId).toBe("scripture");
    expect(rt.bindings.referenceNodeId).toBe("reference");
    expect(rt.bindings.includeVersionInReference).toBe(false);
    expect(rt.workspace).toBe("theme");
    expect(rt.stageBackgroundColor).toContain("10, 20, 30");
  });

  it("round-trips each text layer's content, frame, role, and typography", () => {
    const { document, sceneId } = materializeRhemaThemeDocument(theme);
    const rt = buildRhemaThemeRuntimeJson(document, sceneId);

    const s = rt.textLayers.find((l) => l.id === "scripture");
    expect(s).toBeTruthy();
    expect(s?.text).toBe("For God so loved the world");
    expect(s?.role).toBe("scripture");
    expect(s?.frame).toEqual({ x: 160, y: 300, width: 1600, height: 480 });
    expect(s?.style.fontFamily).toBe("Bebas Neue");
    expect(s?.style.fontSize).toBe(84);
    expect(s?.style.fontWeight).toBe(700);
    expect(s?.style.textAlign).toBe("center");
    expect(s?.style.lineHeight).toBe(1.2);
    expect(s?.style.letterSpacing).toBe(0.02);
    expect(s?.style.color).toContain("255, 255, 255");

    const r = rt.textLayers.find((l) => l.id === "reference");
    expect(r).toBeTruthy();
    expect(r?.role).toBe("reference");
    expect(r?.style.fontStyle).toBe("italic");
    // width:null (auto) must survive as null, not inherit the stage width.
    expect(r?.frame.width).toBe(1600);
    expect(r?.frame.height).toBe(null);
    // hex input color materializes and extracts as an rgba() string.
    expect(r?.style.color).toContain("216, 221, 230");
  });

  it("round-trips stroke and text-shadow", () => {
    const { document, sceneId } = materializeRhemaThemeDocument(theme);
    const rt = buildRhemaThemeRuntimeJson(document, sceneId);

    const s = rt.textLayers.find((l) => l.id === "scripture");
    expect(s?.style.strokeWidth).toBe(2);
    expect(s?.style.strokeColor).toContain("0, 0, 0");
    expect(s?.style.textShadow).toContain("2px 2px 4px");
  });

  it("preserves per-node component kind and visibility rules", () => {
    const withExtras: RhemaThemeRuntimeJson = {
      ...theme,
      textLayers: [
        { ...theme.textLayers[0], componentKind: "clock" },
        theme.textLayers[1],
      ],
      visibilityRules: {
        reference: { condition: "has-text", sourceTextNodeId: "scripture" },
      },
    };
    const { document, sceneId } = materializeRhemaThemeDocument(withExtras);
    const rt = buildRhemaThemeRuntimeJson(document, sceneId);

    const s = rt.textLayers.find((l) => l.id === "scripture");
    expect(s?.componentKind).toBe("clock");
    expect(rt.visibilityRules.reference).toEqual({
      condition: "has-text",
      sourceTextNodeId: "scripture",
    });
  });
});
