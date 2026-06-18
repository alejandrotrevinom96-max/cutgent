import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { CameraMotionBlur } from "@remotion/motion-blur";
import type { Project } from "@/lib/schema";
import { ClipView } from "./ClipView";

/**
 * The single Remotion composition that renders the whole document. Used by
 * both the live <Player> (preview) and the headless renderer (export), so the
 * preview is pixel-identical to the exported MP4.
 *
 * tracks[0] renders at the bottom; later tracks render on top.
 */
export const VideoComposition: React.FC<{
  document: Project;
  /** Solo en el Player (preview): usa proxies de baja resolución. */
  preview?: boolean;
  /** Mapa src original → proxySrc (solo preview). */
  proxyMap?: Record<string, string>;
  /** Clip seleccionado (solo preview): se samplea para los scopes. */
  selectedClipId?: string | null;
}> = ({ document, preview, proxyMap, selectedClipId }) => {
  const layers = document.tracks.map((track) => {
    if (track.hidden) return null;
    return (
      <React.Fragment key={track.id}>
        {track.clips.map((clip) => (
          <Sequence
            key={clip.id}
            from={clip.start}
            durationInFrames={Math.max(1, clip.duration)}
            layout="none"
            name={clip.name}
          >
            <ClipView
              clip={clip}
              trackVolume={track.muted ? 0 : track.volume}
              preview={preview}
              proxyMap={proxyMap}
              sampleScope={!!preview && clip.id === selectedClipId}
            />
          </Sequence>
        ))}
      </React.Fragment>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: document.backgroundColor }}>
      {document.motionBlur ? (
        <CameraMotionBlur
          samples={document.motionBlur.samples}
          shutterAngle={document.motionBlur.shutterAngle}
        >
          {layers}
        </CameraMotionBlur>
      ) : (
        layers
      )}
    </AbsoluteFill>
  );
};
