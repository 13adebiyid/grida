/**
 * Stage component palette — insert templates for the 11 stage-layout
 * components offered in the editor (Current Scripture, Current Reference,
 * Next Up, Next Slide Text, Clock, Segment Timer, Video Countdown,
 * PreShow Countdown, Stage Message, Slide Notes, Screen Preview).
 *
 * Each entry exports a label, a kind discriminator, and a `prototype`
 * factory that returns a Grida NodePrototype with sensible defaults
 * (frame size, font, text). When the operator clicks an insert button
 * in the editor sidebar, the playground inserts the prototype into
 * the active stage container and stamps the kind on the new node's
 * userdata. BH's /live runtime (Pass 5) evaluates the kind and
 * replaces the rendered content with a live data source.
 *
 * Frame coordinates are picked to scatter components inside the
 * 1920x1080 stage rect; the operator repositions / restyles as needed
 * after insertion.
 */

import grida from "@grida/schema";
import kolor from "@grida/color";
import { editor } from "@/grida-canvas";
import type { RhemaComponentKind } from "./rhema-contract";

const WHITE = kolor.colorformats.RGBA32F.WHITE;
const AMBER = kolor.colorformats.RGBA32F.fromHEX("#ffb300");
const DIM_WHITE = kolor.colorformats.RGBA32F.fromHEX("#cccccc");

function textPrototype(opts: {
  name: string;
  text: string;
  width: number;
  height: number;
  left: number;
  top: number;
  fontSize: number;
  fontWeight?: number;
  textAlign?: "left" | "center" | "right";
  color?: typeof WHITE;
}): grida.program.nodes.NodePrototype {
  return {
    type: "tspan",
    name: opts.name,
    layout_target_width: opts.width,
    layout_target_height: opts.height,
    layout_positioning: "absolute",
    layout_inset_left: opts.left,
    layout_inset_top: opts.top,
    z_index: 1,
    opacity: 1,
    rotation: 0,
    text: opts.text,
    text_align: opts.textAlign ?? "center",
    text_align_vertical: "center",
    line_height: 1.2,
    letter_spacing: 0,
    ...editor.config.fonts.DEFAULT_TEXT_STYLE_INTER,
    font_size: opts.fontSize,
    font_weight: opts.fontWeight ?? 600,
    fill: {
      type: "solid",
      color: opts.color ?? WHITE,
      active: true,
    },
  } as grida.program.nodes.NodePrototype;
}

function rectPrototype(opts: {
  name: string;
  width: number;
  height: number;
  left: number;
  top: number;
  color?: typeof WHITE;
}): grida.program.nodes.NodePrototype {
  return {
    type: "container",
    name: opts.name,
    layout_target_width: opts.width,
    layout_target_height: opts.height,
    layout_positioning: "absolute",
    layout_inset_left: opts.left,
    layout_inset_top: opts.top,
    z_index: 1,
    opacity: 1,
    rotation: 0,
    corner_radius: 6,
    children: [],
    fill: {
      type: "solid",
      color: opts.color ?? kolor.colorformats.RGBA32F.fromHEX("#222222"),
      active: true,
    },
    stroke_width: 2,
    stroke_align: "inside",
  } as grida.program.nodes.NodePrototype;
}

export interface StageComponentSpec {
  kind: RhemaComponentKind;
  label: string;
  description: string;
  prototype: () => grida.program.nodes.NodePrototype;
}

export const STAGE_COMPONENTS: StageComponentSpec[] = [
  {
    kind: "scripture",
    label: "Current Scripture",
    description: "Live current verse text (driven by the operator console).",
    prototype: () =>
      textPrototype({
        name: "Current Scripture",
        text: "Current scripture text will appear here.",
        width: 1600,
        height: 500,
        left: 160,
        top: 200,
        fontSize: 72,
        fontWeight: 600,
      }),
  },
  {
    kind: "reference",
    label: "Current Reference",
    description: "Live verse reference (e.g. John 3:16 - KJV).",
    prototype: () =>
      textPrototype({
        name: "Current Reference",
        text: "John 3:16 - KJV",
        width: 1600,
        height: 80,
        left: 160,
        top: 740,
        fontSize: 32,
        fontWeight: 500,
        color: DIM_WHITE,
      }),
  },
  {
    kind: "next-up",
    label: "Next Up Scripture",
    description: "Preview-pane verse — what's queued next.",
    prototype: () =>
      textPrototype({
        name: "Next Up",
        text: "Next: ...",
        width: 1600,
        height: 100,
        left: 160,
        top: 880,
        fontSize: 36,
        fontWeight: 500,
        color: DIM_WHITE,
      }),
  },
  {
    kind: "next-slide-text",
    label: "Next Slide Text",
    description: "Text of the upcoming slide (the queued verse / lyric).",
    prototype: () =>
      textPrototype({
        name: "Next Slide Text",
        text: "Next slide text will appear here.",
        width: 1600,
        height: 300,
        left: 160,
        top: 600,
        fontSize: 44,
        fontWeight: 500,
        color: DIM_WHITE,
      }),
  },
  {
    kind: "clock",
    label: "System Clock",
    description: "Live wall clock (1Hz). Formatted '1:23 PM'.",
    prototype: () =>
      textPrototype({
        name: "Clock",
        text: "1:23 PM",
        width: 500,
        height: 140,
        left: 1380,
        top: 40,
        fontSize: 96,
        fontWeight: 600,
        textAlign: "right",
      }),
  },
  {
    kind: "segment-timer",
    label: "Segment Timer",
    description:
      "Operator-controlled count-up / count-down. Turns red on overrun.",
    prototype: () =>
      textPrototype({
        name: "Segment Timer",
        text: "12:34",
        width: 360,
        height: 140,
        left: 40,
        top: 40,
        fontSize: 96,
        fontWeight: 700,
        textAlign: "left",
        color: AMBER,
      }),
  },
  {
    kind: "video-countdown",
    label: "Video Countdown",
    description: "Countdown of the currently-playing media item.",
    prototype: () =>
      textPrototype({
        name: "Video Countdown",
        text: "00:30",
        width: 360,
        height: 100,
        left: 760,
        top: 60,
        fontSize: 72,
        fontWeight: 600,
        textAlign: "center",
      }),
  },
  // audio-countdown intentionally NOT offered in the palette: no audio source
  // broadcasts a duration yet, so it can only render blank. The kind remains in
  // RhemaComponentKind + StageLayoutRender so previously-saved layouts still load.
  {
    kind: "preshow-countdown",
    label: "PreShow Countdown",
    description:
      "Counts down to a target start time (set in the stage controls).",
    prototype: () =>
      textPrototype({
        name: "PreShow Countdown",
        text: "5:00",
        width: 600,
        height: 200,
        left: 660,
        top: 440,
        fontSize: 140,
        fontWeight: 700,
        textAlign: "center",
      }),
  },
  {
    kind: "stage-message",
    label: "Stage Message",
    description:
      "Live cue channel — operator types a message that appears on stage.",
    prototype: () =>
      textPrototype({
        name: "Stage Message",
        text: "Stage messages appear here.",
        width: 1760,
        height: 120,
        left: 80,
        top: 940,
        fontSize: 56,
        fontWeight: 500,
        color: AMBER,
      }),
  },
  {
    kind: "slide-notes",
    label: "Slide Notes",
    description: "Per-layout sermon notes (one blob per bundle layout).",
    prototype: () =>
      textPrototype({
        name: "Slide Notes",
        text: "Notes for this slide go here.\nMultiple lines OK.",
        width: 800,
        height: 600,
        left: 1080,
        top: 200,
        fontSize: 28,
        fontWeight: 400,
        textAlign: "left",
        color: DIM_WHITE,
      }),
  },
  {
    kind: "screen-preview",
    label: "Screen Preview",
    description:
      "Miniature live render of an audience output (multiview tile).",
    prototype: () =>
      rectPrototype({
        name: "Screen Preview",
        width: 480,
        height: 270,
        left: 1400,
        top: 40,
      }),
  },
];
