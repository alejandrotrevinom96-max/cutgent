import React from "react";
import { AbsoluteFill } from "remotion";

/**
 * Marca de agua de "modo de prueba" para el EXPORT (nunca el preview). Se pinta
 * solo cuando el render es sin licencia (decisión tomada server-side en
 * /api/render). Mosaico diagonal tenue + badge en esquina: el mosaico resiste un
 * recorte y el badge es la firma visible. Implementado con un <pattern> SVG para
 * que sea nítido y barato a cualquier resolución (no cientos de spans a 4K).
 */
export const TrialWatermark: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const tile = Math.max(140, Math.round(width / 7));
  const fontSize = Math.max(16, Math.round(width / 34));
  const badgeSize = Math.max(16, Math.round(width / 60));
  const wmStroke = Math.max(1, Math.round(fontSize / 22));
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="cutgent-trial-wm"
            width={tile}
            height={tile}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-30)"
          >
            <text
              x={0}
              y={tile / 2}
              fontFamily="Inter, Arial, sans-serif"
              fontSize={fontSize}
              fontWeight={700}
              fill="#ffffff"
              fillOpacity={0.22}
              stroke="#000000"
              strokeOpacity={0.18}
              strokeWidth={wmStroke}
              style={{ paintOrder: "stroke" }}
            >
              Cutgent
            </text>
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#cutgent-trial-wm)" />
        <text
          x={width - Math.round(width / 50)}
          y={height - Math.round(height / 28)}
          textAnchor="end"
          fontFamily="Inter, Arial, sans-serif"
          fontSize={badgeSize}
          fontWeight={800}
          fill="#ffffff"
          fillOpacity={0.55}
          style={{ paintOrder: "stroke" }}
          stroke="#000000"
          strokeOpacity={0.35}
          strokeWidth={Math.max(1, Math.round(badgeSize / 12))}
        >
          Hecho con Cutgent · prueba
        </text>
      </svg>
    </AbsoluteFill>
  );
};
