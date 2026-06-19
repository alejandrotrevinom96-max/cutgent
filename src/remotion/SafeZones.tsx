import React from "react";
import { AbsoluteFill } from "remotion";

/**
 * Guías de SAFE-ZONE para componer vertical/social. SOLO se dibujan en el PREVIEW
 * (lo pasa PreviewPanel según un toggle de UI); la ruta de render NUNCA pasa esta
 * prop, así que jamás se exporta. Se dibuja en coordenadas de la composición
 * (SVG viewBox = WxH, preserveAspectRatio="none") para que el <Player> lo
 * letterboxee/escale exactamente igual que el video.
 *
 * - broadcast: title-safe (90%) + action-safe (93%) — útil en cualquier aspecto.
 * - tiktok/reels/shorts: sombrea las bandas que tapa el HUD nativo (top, caption
 *   inferior, rail de acciones derecho) y marca la zona central segura. Solo tiene
 *   sentido en VERTICAL; si el lienzo no es vertical, cae a broadcast.
 *
 * Insets como FRACCIONES (mediados-2026, conservadores; las UIs cambian sin aviso
 * → centralizados aquí). Fuente: creator-tools, tratar como guía, no contrato.
 */
export type SafePlatform = "tiktok" | "reels" | "shorts" | "broadcast";

type Inset = { top: number; bottom: number; left: number; right: number };
const SOCIAL: Record<Exclude<SafePlatform, "broadcast">, Inset> = {
  tiktok: { top: 0.073, bottom: 0.167, left: 0.056, right: 0.152 },
  reels: { top: 0.056, bottom: 0.167, left: 0.056, right: 0.0625 },
  shorts: { top: 0.0625, bottom: 0.156, left: 0.056, right: 0.0625 },
};

export const SafeZones: React.FC<{ width: number; height: number; platform: SafePlatform }> = ({
  width,
  height,
  platform,
}) => {
  // HUD social solo para ~9:16 (ratio ≥ 1.7): los insets están calibrados para
  // 9:16, no para 4:5/portrait suave (que cae a broadcast).
  const useSocial = platform !== "broadcast" && height / width >= 1.7;
  const stroke = Math.max(1, Math.round(width / 480));
  const dash = `${stroke * 4} ${stroke * 3}`;

  const action = { x: width * 0.035, y: height * 0.035 }; // 93%
  const title = { x: width * 0.05, y: height * 0.05 }; // 90%
  const safeBox = (m: { x: number; y: number }, color: string) => (
    <rect
      x={m.x}
      y={m.y}
      width={width - 2 * m.x}
      height={height - 2 * m.y}
      fill="none"
      stroke={color}
      strokeOpacity={0.5}
      strokeWidth={stroke}
      strokeDasharray={dash}
    />
  );

  const s = useSocial ? SOCIAL[platform as Exclude<SafePlatform, "broadcast">] : null;
  const T = s ? height * s.top : 0;
  const B = s ? height * s.bottom : 0;
  const L = s ? width * s.left : 0;
  const R = s ? width * s.right : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Broadcast title/action-safe: siempre. */}
        {safeBox(action, "#22d3ee")}
        {safeBox(title, "#f59e0b")}

        {/* HUD social: sombrea bandas tapadas + zona central segura (solo vertical). */}
        {s && (
          <>
            <rect x={0} y={0} width={width} height={T} fill="#000" fillOpacity={0.4} />
            <rect x={0} y={height - B} width={width} height={B} fill="#000" fillOpacity={0.4} />
            <rect x={width - R} y={T} width={R} height={height - T - B} fill="#000" fillOpacity={0.4} />
            <rect x={0} y={T} width={L} height={height - T - B} fill="#000" fillOpacity={0.4} />
            <rect
              x={L}
              y={T}
              width={width - L - R}
              height={height - T - B}
              fill="none"
              stroke="#34d399"
              strokeOpacity={0.9}
              strokeWidth={stroke}
            />
          </>
        )}
      </svg>
    </AbsoluteFill>
  );
};
