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
      defaultProps={{ document: fallback, watermark: true }}
      calculateMetadata={({ props }) => {
        const doc = props.document as Project;
        // Clamp defensivo: dimensiones pares (yuv420p), acotadas y > 0, fps válido.
        const evenClamp = (n: number) => {
          const v = Math.min(7680, Math.max(2, Math.round(Number(n) || 2)));
          return v % 2 === 0 ? v : v + 1;
        };
        return {
          durationInFrames: Math.max(1, Math.round(Number(doc.durationInFrames) || 1)),
          fps: Math.min(120, Math.max(1, Number(doc.fps) || 30)),
          width: evenClamp(doc.width),
          height: evenClamp(doc.height),
        };
      }}
    />
  );
};
