/**
 * Convierte la salida de un tracker (bbox por frame, en px del MEDIA nativo) en
 * keyframes que el render entiende (x/y = offset en px desde el CENTRO del canvas;
 * scale = multiplicador; opacity = oclusión). Función PURA y determinista → se
 * verifica sin llamar a ningún modelo. El bug #1 de esta fase es confundir los
 * espacios de coordenadas (media vs caja CSS vs offset-desde-centro); aquí está
 * resuelto en un solo lugar.
 */
import type { Keyframe } from "./schema";
import { rdp, type Pt } from "./rdp";

/** Caja del objeto en un frame, en coordenadas del MEDIA nativo del clip. */
export interface TrackBbox {
  frame: number; // frame del media (se le resta clip.trimStart para hacerlo local al clip)
  cx: number; // centro X del objeto (px media)
  cy: number; // centro Y del objeto (px media)
  w: number; // ancho del bbox (px media)
  h: number; // alto del bbox (px media)
  visible?: boolean; // false = ocluido (undefined = visible)
}

export interface TrackMapOptions {
  canvas: { width: number; height: number };
  clip: { width?: number; height?: number; fit: "cover" | "contain" | "fill"; trimStart?: number };
  intrinsic: { width: number; height: number }; // dims nativas del media
  animateScale?: boolean; // default false
  animateOpacity?: boolean; // default true
  epsilonXY?: number; // default 1.5 (px)
  epsilonScale?: number; // default 0.01
}

export interface TrackKeyframes {
  x: Keyframe[];
  y: Keyframe[];
  scale?: Keyframe[];
  opacity?: Keyframe[];
}

const kf = (frame: number, value: number): Keyframe => ({ frame, value, easing: "linear" });
const toKfs = (pts: Pt[]): Keyframe[] => pts.map((p) => kf(p.frame, p.value));

/**
 * Mapea bboxes → keyframes. x/y/scale se simplifican con RDP; opacity emite
 * keyframes solo en transiciones de visibilidad (cuasi-corte, no fade).
 */
export function trackerBboxToKeyframes(boxes: TrackBbox[], opts: TrackMapOptions): TrackKeyframes {
  const empty: TrackKeyframes = { x: [], y: [] };
  if (boxes.length === 0) return empty;

  const { canvas, clip, intrinsic } = opts;
  const trimStart = clip.trimStart ?? 0;
  const epsXY = opts.epsilonXY ?? 1.5;
  const epsScale = opts.epsilonScale ?? 0.01;

  // Paso 0 — caja CSS del clip (ClipView usa dims del canvas si width/height undefined).
  const wBox = clip.width ?? canvas.width;
  const hBox = clip.height ?? canvas.height;

  // Paso 1 — fit: cómo se escala el media DENTRO de la caja.
  let sX: number;
  let sY: number;
  let offX: number;
  let offY: number;
  if (clip.fit === "fill") {
    sX = wBox / intrinsic.width;
    sY = hBox / intrinsic.height;
    offX = 0;
    offY = 0;
  } else {
    const sFit =
      clip.fit === "cover"
        ? Math.max(wBox / intrinsic.width, hBox / intrinsic.height)
        : Math.min(wBox / intrinsic.width, hBox / intrinsic.height);
    sX = sFit;
    sY = sFit;
    offX = (wBox - intrinsic.width * sFit) / 2; // cover → ≤0 (crop); contain → ≥0 (letterbox)
    offY = (hBox - intrinsic.height * sFit) / 2;
  }

  // Frames locales al clip (descarta los previos a trimStart).
  const local = boxes
    .map((b) => ({ ...b, frame: b.frame - trimStart }))
    .filter((b) => b.frame >= 0)
    .sort((a, b) => a.frame - b.frame);
  if (local.length === 0) return empty;

  const xPts: Pt[] = [];
  const yPts: Pt[] = [];
  const scalePts: Pt[] = [];
  const wObj0 = local[0].w * sX; // ancho del objeto (px caja) en el primer frame

  for (const b of local) {
    // Paso 2/3 — centro del objeto en la caja → offset desde el centro (= keyframe).
    const cxBox = b.cx * sX + offX;
    const cyBox = b.cy * sY + offY;
    xPts.push({ frame: b.frame, value: cxBox - wBox / 2 });
    yPts.push({ frame: b.frame, value: cyBox - hBox / 2 });
    // Paso 4 — escala relativa al primer frame.
    scalePts.push({ frame: b.frame, value: wObj0 > 0 ? (b.w * sX) / wObj0 : 1 });
  }

  const out: TrackKeyframes = {
    x: toKfs(rdp(xPts, epsXY)),
    y: toKfs(rdp(yPts, epsXY)),
  };

  if (opts.animateScale) out.scale = toKfs(rdp(scalePts, epsScale));

  // Paso 5 — oclusión: keyframes solo en transiciones (par viejo/nuevo = cuasi-corte).
  const animateOpacity = opts.animateOpacity ?? true;
  if (animateOpacity && local.some((b) => b.visible !== undefined)) {
    const op: Keyframe[] = [];
    const vis = (b: TrackBbox) => (b.visible !== false ? 1 : 0);
    op.push(kf(local[0].frame, vis(local[0])));
    for (let i = 1; i < local.length; i++) {
      if (vis(local[i]) !== vis(local[i - 1])) {
        op.push(kf(local[i - 1].frame, vis(local[i - 1]))); // mantiene el valor previo hasta el cambio
        op.push(kf(local[i].frame, vis(local[i]))); // y cambia en ~1 frame
      }
    }
    out.opacity = op; // el reducer dedup+ordena
  }

  return out;
}
