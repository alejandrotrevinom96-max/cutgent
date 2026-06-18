"use client";

/**
 * Cache de waveforms en el cliente: una sola petición por src (compartida entre
 * todos los ClipBlock que usen el mismo audio).
 */
const cache = new Map<string, Promise<number[]>>();

export function getWaveformPeaks(src: string): Promise<number[]> {
  if (!src) return Promise.resolve([]);
  let p = cache.get(src);
  if (!p) {
    p = fetch(`/api/waveform?src=${encodeURIComponent(src)}`)
      .then((r) => r.json())
      .then((d) => (Array.isArray(d.peaks) ? (d.peaks as number[]) : []))
      .catch(() => []);
    cache.set(src, p);
  }
  return p;
}
