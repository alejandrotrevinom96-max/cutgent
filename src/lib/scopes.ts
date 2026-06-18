"use client";

/**
 * Canal ligero para los scopes de video. ClipView samplea el <video>/<img> del
 * clip SELECCIONADO (vía onVideoFrame/onImageFrame de Remotion) a un canvas
 * pequeño y publica el ImageData aquí. El ScopesPanel se suscribe y dibuja.
 *
 * FUERA de zustand a propósito: meter pixeles por frame en el store re-renderiza
 * todo el documento a 30-60fps. Esto es un pub/sub aislado.
 *
 * SALVEDAD: mide la FUENTE del clip (pixeles del <video> decodificado), NO el
 * composite final (sin colorGrade/CSS/blend/capas). Es un scope "antes del
 * grade", como en DaVinci. Etiquetar "Fuente (clip)".
 */

const W = 256;
const H = 144;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let latest: ImageData | null = null;
let tainted = false;
let enabled = false; // solo se samplea si el panel de Scopes está abierto
const listeners = new Set<() => void>();

/** Activa/desactiva el sampleo. Sin esto, sampleElement haría un getImageData
 *  (lectura síncrona GPU→CPU) por CADA frame decodificado aunque el panel esté
 *  cerrado (el caso por defecto), penalizando la reproducción. */
export function setScopesEnabled(on: boolean): void {
  enabled = on;
  if (!on) latest = null;
}

function ensure(): void {
  if (canvas || typeof document === "undefined") return;
  canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext("2d", { willReadFrequently: true });
}

/** Samplea un <video>/<img>/canvas y publica su ImageData reducido. */
export function sampleElement(el: CanvasImageSource): void {
  if (!enabled) return; // no samplear si el panel de Scopes está cerrado
  ensure();
  if (!ctx) return;
  try {
    ctx.drawImage(el, 0, 0, W, H);
    latest = ctx.getImageData(0, 0, W, H);
    tainted = false;
  } catch {
    // getImageData lanza SecurityError si el canvas quedó "tainted" (fuente
    // remota sin CORS). Degradar en vez de romper.
    latest = null;
    tainted = true;
  }
  for (const l of listeners) l();
}

export function clearScope(): void {
  latest = null;
  for (const l of listeners) l();
}

export function getScope(): { data: ImageData | null; tainted: boolean } {
  return { data: latest, tainted };
}

export function subscribeScope(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const SCOPE_W = W;
export const SCOPE_H = H;
