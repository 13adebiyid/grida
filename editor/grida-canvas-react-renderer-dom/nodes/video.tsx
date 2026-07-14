import React, { useEffect, useRef } from "react";
import queryattributes from "./utils/attributes";
import grida from "@grida/schema";
import { css } from "@/grida-canvas-utils/css";
import { useExternalAssetUrl } from "./external-asset-url";

export const VideoWidget = ({
  src,
  poster,
  layout_target_width: width,
  layout_target_height: height,
  loop,
  muted,
  volume,
  autoplay,
  trim_start_seconds,
  trim_end_seconds,
  asset_digest,
  poster_asset_digest,
  style,
  ...props
}: grida.program.document.IComputedNodeReactRenderProps<grida.program.nodes.VideoNode>) => {
  const { objectFit, objectPosition, ...divStyles } = style || {};
  const videoRef = useRef<HTMLVideoElement>(null);
  const resolvedSrc = useExternalAssetUrl(src, asset_digest);
  const resolvedPoster = useExternalAssetUrl(poster, poster_asset_digest);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, volume ?? 0));
    const start = Math.max(0, trim_start_seconds ?? 0);
    const end = trim_end_seconds ?? -1;
    const seekToStart = () => {
      if (Number.isFinite(video.duration)) {
        video.currentTime = Math.min(start, video.duration);
      }
    };
    const enforceTrim = () => {
      if (end < 0 || video.currentTime < end) return;
      if (loop) {
        video.currentTime = start;
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    };
    video.addEventListener("loadedmetadata", seekToStart);
    video.addEventListener("timeupdate", enforceTrim);
    if (video.readyState >= 1) seekToStart();
    return () => {
      video.removeEventListener("loadedmetadata", seekToStart);
      video.removeEventListener("timeupdate", enforceTrim);
    };
  }, [loop, trim_end_seconds, trim_start_seconds, volume]);

  return (
    <div
      {...queryattributes(props)}
      style={{ ...divStyles, overflow: "hidden" }}
    >
      {resolvedSrc && (
        <video
          ref={videoRef}
          src={resolvedSrc}
          poster={resolvedPoster}
          width={css.toDimension(width)}
          height={css.toDimension(height)}
          loop={loop && (trim_end_seconds ?? -1) < 0}
          muted={muted}
          autoPlay={autoplay}
          playsInline
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

VideoWidget.type = "video";
