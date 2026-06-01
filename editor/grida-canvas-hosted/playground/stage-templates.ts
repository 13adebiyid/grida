/**
 * Stage layout templates — pre-seeded component sets for the "New
 * Layout" button in the Stage Editor. Each template lists the
 * component kinds to insert (using the templates from
 * stage-components.ts) along with optional per-template position
 * overrides so the resulting scene matches the template's name.
 *
 * Operator picks one from a small modal on first scene creation;
 * components land already positioned + styled, ready to tweak.
 */

import type { RhemaComponentKind } from "./rhema-contract";

export interface StageTemplateComponentSpec {
  kind: RhemaComponentKind;
  /** Optional frame override (stage-pixel coords against 1920x1080). */
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export interface StageTemplateSpec {
  id: string;
  label: string;
  description: string;
  /** Empty array = blank scene (no components inserted). */
  components: StageTemplateComponentSpec[];
}

/**
 * All template definitions. Order is the order shown in the template
 * picker. "Blank" is first so it's the easy default.
 */
export const STAGE_TEMPLATES: StageTemplateSpec[] = [
  {
    id: "blank",
    label: "Blank",
    description: "Empty stage — add components manually.",
    components: [],
  },
  {
    id: "current-next-text",
    label: "Current + Next Text",
    description:
      "Two stacked text panels: large current scripture on top, smaller next-up below.",
    components: [
      { kind: "scripture", left: 80, top: 60, width: 1760, height: 480 },
      { kind: "next-up", left: 80, top: 600, width: 1760, height: 280 },
      { kind: "reference", left: 80, top: 920, width: 1760, height: 100 },
    ],
  },
  {
    id: "current-text-notes",
    label: "Current Text + Notes",
    description: "Current scripture on the left, slide notes on the right.",
    components: [
      { kind: "scripture", left: 60, top: 80, width: 1000, height: 800 },
      { kind: "slide-notes", left: 1100, top: 80, width: 760, height: 800 },
      { kind: "reference", left: 60, top: 920, width: 1000, height: 100 },
    ],
  },
  {
    id: "current-next-previews",
    label: "Current + Next Previews",
    description:
      "Miniature renders of the current and next audience output (multiview confidence).",
    components: [
      { kind: "screen-preview", left: 120, top: 120, width: 800, height: 450 },
      { kind: "screen-preview", left: 1000, top: 120, width: 800, height: 450 },
      { kind: "scripture", left: 120, top: 620, width: 1680, height: 200 },
      { kind: "reference", left: 120, top: 860, width: 1680, height: 100 },
    ],
  },
  {
    id: "current-notes-timers",
    label: "Current + Notes + Timers",
    description:
      "Current scripture, slide notes, plus a row of clock + segment + video countdown.",
    components: [
      { kind: "scripture", left: 60, top: 200, width: 1100, height: 600 },
      { kind: "slide-notes", left: 1200, top: 200, width: 660, height: 600 },
      { kind: "clock", left: 1500, top: 40, width: 380, height: 140 },
      { kind: "segment-timer", left: 60, top: 40, width: 360, height: 140 },
      { kind: "video-countdown", left: 760, top: 40, width: 400, height: 140 },
      { kind: "reference", left: 60, top: 880, width: 1800, height: 100 },
    ],
  },
  {
    id: "current-timers",
    label: "Current + Timers",
    description:
      "Current scripture with system clock + segment timer + video countdown in a row.",
    components: [
      { kind: "scripture", left: 60, top: 240, width: 1800, height: 600 },
      { kind: "clock", left: 1480, top: 40, width: 400, height: 160 },
      { kind: "segment-timer", left: 60, top: 40, width: 400, height: 160 },
      { kind: "video-countdown", left: 760, top: 40, width: 400, height: 160 },
      { kind: "reference", left: 60, top: 880, width: 1800, height: 100 },
    ],
  },
  {
    id: "system-clock",
    label: "System Clock",
    description: "Giant clock display — wall-clock confidence monitor.",
    components: [
      { kind: "clock", left: 240, top: 280, width: 1440, height: 500 },
    ],
  },
  {
    id: "multiview",
    label: "Multiview",
    description:
      "Grid of screen previews (audience + lower-third + lobby) for production crew.",
    components: [
      { kind: "screen-preview", left: 40, top: 40, width: 920, height: 520 },
      { kind: "screen-preview", left: 960, top: 40, width: 920, height: 520 },
      { kind: "screen-preview", left: 40, top: 560, width: 920, height: 480 },
      {
        kind: "screen-preview",
        left: 960,
        top: 560,
        width: 920,
        height: 480,
      },
    ],
  },
];
