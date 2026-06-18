import React from "react";
import { Composition } from "remotion";
import { createDefaultProject } from "@/lib/factory";
import type { Project } from "@/lib/schema";
import { VideoComposition } from "./VideoComposition";

/**
 * Registered composition for the Remotion bundler/CLI used by the export
 * pipeline. Dimensions/fps/duration come from the document via
 * calculateMetadata, so any project renders through this single entry.
 */
export const RemotionRoot: React.FC = () => {
  const fallback = createDefaultProject();
  return (
    <Composition
      id="MainVideo"
      component={VideoComposition}
      durationInFrames={fallback.durationInFrames}
      fps={fallback.fps}
      width={fallback.width}
      height={fallback.height}
      defaultProps={{ document: fallback }}
      calculateMetadata={({ props }) => {
        const doc = props.document as Project;
        return {
          durationInFrames: Math.max(1, Math.round(doc.durationInFrames)),
          fps: doc.fps,
          width: doc.width,
          height: doc.height,
        };
      }}
    />
  );
};
