/**
 * Generador PURO de keyframes de "wiggle" (oscilación sinusoidal) para una
 * propiedad animable. Vive dentro del MCP (sin deps del SDK ni de la app) para
 * (1) mantener el servidor autónomo y (2) ser testeable con tsx de forma
 * determinista. La curva: value(f) = base + amplitude * sin(2π * freq * f/fps).
 */

export type WiggleEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface WiggleKeyframe {
  frame: number;
  value: number;
  easing: WiggleEasing;
}

export interface WiggleParams {
  base: number;
  amplitude: number;
  frequencyHz: number;
  durationFrames: number;
  fps: number;
  easing?: WiggleEasing;
}

/**
 * Muestrea la sinusoide a ≥8 keyframes por ciclo (con interp lineal eso ya se ve
 * como onda suave; 4 daría triangular). Frames enteros 0..durationFrames inclusive,
 * dedup por frame (last-wins) + orden ascendente. DETERMINISTA: mismos params ⇒
 * mismo array (sin Math.random ni Date).
 */
export function generateWiggleKeyframes(p: WiggleParams): WiggleKeyframe[] {
  const fps = Math.max(1, p.fps);
  const durationFrames = Math.max(1, Math.round(p.durationFrames));
  const freq = Math.max(0.01, p.frequencyHz); // clamp: evita div/0 y curva plana
  const easing = p.easing ?? "linear";
  const at = (f: number): number => p.base + p.amplitude * Math.sin(2 * Math.PI * freq * (f / fps));

  // ≥8 muestras/ciclo, acotado a [1, durationFrames] para que clips largos no exploten.
  const cycleFrames = fps / freq;
  const stride = Math.max(1, Math.min(durationFrames, Math.floor(cycleFrames / 8) || 1));

  const raw: WiggleKeyframe[] = [];
  for (let f = 0; f <= durationFrames; f += stride) {
    raw.push({ frame: Math.round(f), value: at(f), easing });
  }
  // Cierra la curva en el borde exacto del clip.
  if (raw[raw.length - 1].frame !== durationFrames) {
    raw.push({ frame: durationFrames, value: at(durationFrames), easing });
  }

  const byFrame = new Map<number, WiggleKeyframe>();
  for (const k of raw) byFrame.set(k.frame, k);
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}
