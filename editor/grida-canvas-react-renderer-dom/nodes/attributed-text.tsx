import React from "react";
import type grida from "@grida/schema";
import { css } from "@/grida-canvas-utils/css";
import queryattributes from "./utils/attributes";

function textStyle(
  textAlign: grida.program.nodes.AttributedTextNode["text_align"],
  textAlignVertical: grida.program.nodes.AttributedTextNode["text_align_vertical"],
  nodePaints: grida.program.nodes.AttributedTextNode["fill_paints"],
  style: grida.program.nodes.i.ITextStyle,
  paints: grida.program.nodes.AttributedTextNode["fill_paints"]
): React.CSSProperties {
  return css.toReactTextStyle({
    ...style,
    text_align: textAlign,
    text_align_vertical: textAlignVertical,
    fill: paints?.[0] ?? nodePaints?.[0],
  } as grida.program.nodes.i.IComputedTextNodeStyle);
}

/**
 * Lossless display path for native attributed text. Character editing stays
 * intentionally inactive until the range-aware editor lands; selection,
 * transforms, ordering, duplication and deletion remain normal node actions.
 */
export const AttributedTextWidget = ({
  text,
  default_style,
  styled_runs,
  fill_paints,
  text_align,
  text_align_vertical,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.AttributedTextNode>) => {
  const value = text ?? "";
  const base = textStyle(
    text_align,
    text_align_vertical,
    fill_paints,
    default_style,
    fill_paints
  );

  return (
    <div
      {...queryattributes(props)}
      style={{ ...style, ...base, whiteSpace: "pre-wrap" }}
    >
      {styled_runs.length > 0
        ? styled_runs.map((run, index) => (
            <span
              key={`${run.start}:${run.end}:${index}`}
              style={textStyle(
                text_align,
                text_align_vertical,
                fill_paints,
                run.style,
                run.fill_paints
              )}
            >
              {value.slice(run.start, run.end)}
            </span>
          ))
        : value}
    </div>
  );
};

AttributedTextWidget.type = "text";
