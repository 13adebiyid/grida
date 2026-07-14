import React from "react";
import queryattributes from "./utils/attributes";
import grida from "@grida/schema";
import { css } from "@/grida-canvas-utils/css";
import { useExternalAssetUrl } from "./external-asset-url";

export const ImageWidget = ({
  src,
  alt,
  layout_target_width: width,
  layout_target_height: height,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.ImageNode>) => {
  const { objectFit, objectPosition, ...divStyles } = style || {};
  const resolvedSrc = useExternalAssetUrl(src);

  return (
    <div
      style={{ ...divStyles, overflow: "hidden" }}
      {...queryattributes(props)}
    >
      {resolvedSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedSrc}
          width={css.toDimension(width)}
          height={css.toDimension(height)}
          alt={alt}
          style={{
            width: "100%",
            height: "100%",
            objectFit,
            objectPosition,
          }}
        />
      )}
    </div>
  );
};

ImageWidget.type = "image";
