// buildLipsync — phoneme timeline -> normalized VisemeEvent[] on the AUDIO clock.
// This is the ONE contract the avatar consumes; swapping STT/TTS or switching
// forced-alignment <-> FFT fallback never touches the avatar. Pure; zero deps.
//
// VisemeEvent = {
//   turnId, target:{kind:"viseme", id}, startMs, durMs, weight
// }
// startMs is relative to the first audio sample of the turn; events are emitted
// ~lookAheadMs early so the avatar's blend ramps before phonation (coarticulation).

import { phonemeToViseme } from "./visemeMap.mjs";

/**
 * @param {{turnId:string, phonemes:{phoneme:string,startMs:number,durMs:number}[]}} track
 * @param {{lookAheadMs?:number, weight?:number}} [opts]
 * @returns {object[]} VisemeEvent[]
 */
export function buildLipsync(track, opts = {}) {
  const lookAheadMs = opts.lookAheadMs ?? 80;
  const weight = opts.weight ?? 1;
  const events = [];
  for (const ph of track.phonemes || []) {
    const id = phonemeToViseme(ph.phoneme);
    if (!id) continue; // closed mouth: no event (weights relax to 0)
    events.push({
      turnId: track.turnId,
      target: { kind: "viseme", id },
      startMs: Math.max(0, ph.startMs - lookAheadMs),
      durMs: ph.durMs,
      weight,
    });
  }
  return events;
}
