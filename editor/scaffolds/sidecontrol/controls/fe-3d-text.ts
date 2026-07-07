import cg from "@grida/cg";

/**
 * 3D text extrusion — ProPresenter-style depth for tspan nodes
 * (Bible Helper).
 *
 * Depth N = N extra SHARP shadows stepped along the master shadow's offset
 * direction at full opacity — a linear extrusion. No new effect model: the
 * stack is plain `fe_shadows` and round-trips through save/load/export like
 * any other shadow. Depth is DERIVED (count of sharp zero-blur extras),
 * never stored.
 *
 * 2026-07-07 (batch item 8): the stack is PRESENTED as one synthetic
 * "3D Text" row in the standard Effects section — setting depth used to
 * spray N raw "Shadow" rows into the list, which read as a bug. The
 * derivation + builder moved here so the Effects section and any host
 * panel share one definition.
 */

export const MAX_EXTRUDE_DEPTH = 16;
export const DEFAULT_EXTRUDE_DEPTH = 4;

export interface ExtrudeStack {
  /** The master shadow (fe_shadows[0]) the extrusion derives from. */
  master: cg.FeShadow;
  /** Number of extrusion steps (fe_shadows[1..depth]). */
  depth: number;
}

/**
 * Detect the extrusion stack in a node's `fe_shadows`: a master at index 0
 * followed by ≥1 sharp (blur=0, spread=0, non-inset) steps. Returns null
 * when there is no stack (plain shadows stay individual rows).
 */
export function deriveExtrudeStack(
  fe_shadows: cg.FeShadow[] | undefined
): ExtrudeStack | null {
  if (!fe_shadows || fe_shadows.length < 2) return null;
  const extras = fe_shadows.slice(1);
  const sharp = extras.every(
    (s) => (s.blur ?? 0) === 0 && (s.spread ?? 0) === 0 && !s.inset
  );
  if (!sharp) return null;
  return { master: fe_shadows[0], depth: extras.length };
}

/**
 * Build `depth` extrusion steps from the master shadow. Direction follows
 * the master's offset (down-right when it has none); each step is sharp
 * and fully opaque so the extrusion reads as a solid side.
 */
export function buildExtrudeSteps(
  master: cg.FeShadow,
  depth: number
): cg.FeShadow[] {
  const clamped = Math.max(0, Math.min(MAX_EXTRUDE_DEPTH, Math.round(depth)));
  const len = Math.hypot(master.dx, master.dy);
  const ux = len > 0.01 ? master.dx / len : Math.SQRT1_2;
  const uy = len > 0.01 ? master.dy / len : Math.SQRT1_2;
  const steps: cg.FeShadow[] = [];
  for (let i = 1; i <= clamped; i++) {
    steps.push({
      ...master,
      type: "shadow",
      inset: false,
      dx: Math.round(ux * i * 100) / 100,
      dy: Math.round(uy * i * 100) / 100,
      blur: 0,
      spread: 0,
      color: { ...master.color, a: 1 },
    });
  }
  return steps;
}
