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

  it("extracts fe_shadows dx/dy — the 3D-text extrusion stack survives to text-shadow (2026-07-09)", () => {
    // Schema shape written by the editor's 3D Text control: sharp offset
    // steps, blur 0. The old extractor read a nonexistent `offset` tuple,
    // collapsing every step to `0px 0px` — 3D text was invisible on live.
    const sceneId = "scene-1";
    const stageId = "stage-1";
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
        },
        [tspanId]: {
          id: tspanId,
          type: "tspan",
          name: "Scripture",
          text: "For God so loved the world",
          font_size: 84,
          fe_shadows: [
            {
              type: "shadow",
              dx: 2,
              dy: 2,
              blur: 0,
              spread: 0,
              color: { r: 0, g: 0, b: 0, a: 1 },
            },
            {
              type: "shadow",
              dx: 4,
              dy: 4,
              blur: 0,
              spread: 0,
              color: { r: 0, g: 0, b: 0, a: 1 },
            },
            // Inactive steps are dropped, not rendered at 0,0.
            {
              type: "shadow",
              dx: 6,
              dy: 6,
              blur: 0,
              spread: 0,
              color: { r: 0, g: 0, b: 0, a: 1 },
              active: false,
            },
          ],
        },
      },
      links: {
        [sceneId]: [stageId, tspanId],
        [stageId]: [],
        [tspanId]: [],
      },
      metadata: {
        [sceneId]: {
          userdata: { rhema_binding_scripture_node_id: tspanId },
        },
      },
    } as unknown as Parameters<typeof buildRhemaThemeRuntimeJson>[0];

    const runtime = buildRhemaThemeRuntimeJson(document, sceneId);
    const layer = runtime.textLayers.find((entry) => entry.id === tspanId);
    expect(layer?.style.textShadow).toContain("2px 2px 0px");
    expect(layer?.style.textShadow).toContain("4px 4px 0px");
    expect(layer?.style.textShadow).not.toContain("6px 6px");
    expect(layer?.style.textShadow).not.toContain("0px 0px 0px");
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

  it("materializes a visible placeholder for empty design-time text (BH builtins)", () => {
    const theme = {
      scene: {
        id: "builtin-lyric-default",
        name: "Default Lyrics (Lower Third)",
      },
      stage: { width: 1920, height: 1080 },
      textLayers: [
        {
          id: "lyric-body",
          name: "Lyric Body",
          text: "",
          role: "scripture",
          style: { color: "#ffffff", fontSize: 64 },
          frame: { x: 160, y: 680, width: 1600, height: 340 },
        },
      ],
    } as never;
    const { document } = materializeRhemaThemeDocument(theme);
    const tspan = Object.values(document.nodes).find(
      (n) => n.type === "tspan"
    ) as { text?: string };
    expect(tspan?.text).toBe("Lyric Body");
  });
});

// --- extractBackdropImagesForSeed ---------------------------------------
// The wasm SVG import pipeline DROPS <image> nodes (usvg import TODO), so a
// seeded picture theme lost its photo in the editor and the next save
// deleted it from the theme permanently. The seed hook now extracts every
// embedded photo (original encoded bytes preserved) plus its stage-space
// geometry BEFORE createNodeFromSvg, and rebuilds them as native
// image-fill rectangles.
import { extractBackdropImagesForSeed } from "./rhema-contract";

const PNG_URI = "data:image/png;base64,aGVsbG8=";
const JPG_URI = "data:image/jpeg;base64,d29ybGQ=";

describe("extractBackdropImagesForSeed", () => {
  it("extracts the fit-aware export shape (defs image + clip + use transform)", () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1920" height="1080">` +
      `<defs><image id="img_0" width="4000" height="2250" xlink:href="${PNG_URI}"/></defs>` +
      `<clipPath id="cl_1"><rect width="1920" height="1080"/></clipPath>` +
      `<g clip-path="url(#cl_1)"><use transform="matrix(0.48 0 0 0.48 0 -1.5)" xlink:href="#img_0"/></g>` +
      `</svg>`;
    const { images, remainderSvg } = extractBackdropImagesForSeed(svg);
    expect(images.length).toBe(1);
    expect(images[0].dataUri).toBe(PNG_URI);
    expect(images[0].fit).toBe("fill");
    expect(images[0].rect.x).toBeCloseTo(0);
    expect(images[0].rect.y).toBeCloseTo(-1.5);
    expect(images[0].rect.width).toBeCloseTo(4000 * 0.48);
    expect(images[0].rect.height).toBeCloseTo(2250 * 0.48);
    // Nothing paintable left — remainder suppressed entirely.
    expect(remainderSvg).toBe(null);
  });

  it("extracts the legacy pattern shape as a cover-fit rect", () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">` +
      `<defs><pattern id="pattern_0" patternUnits="userSpaceOnUse" width="100%" height="100%" x="0" y="0">` +
      `<image id="img_0" x="0" y="0" width="4000" height="2250" xlink:href="${JPG_URI}"/>` +
      `</pattern></defs>` +
      `<rect fill="url(#pattern_0)" width="1920" height="1080"/>` +
      `</svg>`;
    const { images, remainderSvg } = extractBackdropImagesForSeed(svg);
    expect(images.length).toBe(1);
    expect(images[0].dataUri).toBe(JPG_URI);
    expect(images[0].fit).toBe("cover");
    expect(images[0].rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(remainderSvg).toBe(null);
  });

  it("keeps non-image content as the remainder", () => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">` +
      `<defs><image id="img_0" width="100" height="100" xlink:href="${PNG_URI}"/></defs>` +
      `<g clip-path="url(#c)"><use transform="matrix(1 0 0 1 10 20)" xlink:href="#img_0"/></g>` +
      `<path d="M0 0L10 10" fill="#fff"/>` +
      `</svg>`;
    const { images, remainderSvg } = extractBackdropImagesForSeed(svg);
    expect(images.length).toBe(1);
    expect(images[0].rect).toEqual({ x: 10, y: 20, width: 100, height: 100 });
    expect(remainderSvg).not.toBe(null);
    expect(remainderSvg!.includes("<path")).toBe(true);
    expect(remainderSvg!.includes("base64")).toBe(false);
  });

  it("bails out (no extraction) on rotated/skewed use transforms", () => {
    const svg =
      `<svg width="100" height="100">` +
      `<defs><image id="img_0" width="10" height="10" href="${PNG_URI}"/></defs>` +
      `<use transform="matrix(0.7 0.7 -0.7 0.7 0 0)" href="#img_0"/>` +
      `</svg>`;
    const { images, remainderSvg } = extractBackdropImagesForSeed(svg);
    expect(images.length).toBe(0);
    expect(remainderSvg).toBe(svg);
  });

  it("passes through svgs without images untouched", () => {
    const svg = `<svg width="10" height="10"><rect width="5" height="5"/></svg>`;
    const { images, remainderSvg } = extractBackdropImagesForSeed(svg);
    expect(images.length).toBe(0);
    expect(remainderSvg).toBe(svg);
  });
});
