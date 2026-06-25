/**
 * DSP puro para detección de tempo/beats/onsets/energía. SIN I/O, SIN server-only
 * → determinista y verificable en aislamiento (samples sintéticos). El decode de
 * audio (ffmpeg) vive en beats.ts; esto solo recibe muestras PCM mono.
 *
 * Método (sin FFT): RMS por ventana → flujo de energía (onset) → BPM por
 * autocorrelación acotada a 60–180 → grilla de beats con fase alineada.
 */

export const SR = 22050; // Hz (debe coincidir con el -ar del decode en beats.ts)
export const WIN = 1024; // muestras por ventana
export const HOP = 512; // salto (50% overlap) → ~43.07 envelope frames/seg
const HOP_RATE = SR / HOP;

export interface BeatAnalysis {
  bpm: number | null;
  confidence: number; // 0..1
  durationSec: number;
  beats: number[]; // FRAMES de la fuente (a `fps`)
  onsets: number[]; // FRAMES
  energy: number[]; // 0..1, un valor por frame de proyecto
}

/** RMS por hop. */
export function rmsPerHop(samples: Float32Array): Float32Array {
  const n = samples.length;
  const numHops = Math.max(0, Math.floor((n - WIN) / HOP) + 1);
  const rms = new Float32Array(numHops);
  for (let i = 0; i < numHops; i++) {
    let s = 0;
    const start = i * HOP;
    for (let j = 0; j < WIN; j++) {
      const v = samples[start + j];
      s += v * v;
    }
    rms[i] = Math.sqrt(s / WIN);
  }
  return rms;
}

/** Flujo de energía (onset envelope): diferencia positiva del RMS. */
export function energyFlux(rms: Float32Array): Float32Array {
  const flux = new Float32Array(rms.length);
  for (let i = 1; i < rms.length; i++) flux[i] = Math.max(0, rms[i] - rms[i - 1]);
  return flux;
}

/** BPM por autocorrelación del flux, acotada a 60–180, con interpolación parabólica. */
export function estimateBpm(flux: Float32Array): { bpm: number | null; confidence: number } {
  const lagMin = Math.max(2, Math.floor((60 * HOP_RATE) / 180)); // ~14
  const lagMax = Math.min(flux.length - 2, Math.ceil((60 * HOP_RATE) / 60)); // ~44
  if (lagMax <= lagMin) return { bpm: null, confidence: 0 };

  const ac = new Float64Array(lagMax + 2);
  // Prior log-normal de tempo centrado en ~120 BPM (σ=0.5 octavas): resuelve la
  // ambigüedad de octava (no reportar 60 cuando es 120) ponderando la autocorr.
  const SIGMA = 0.5;
  let bestLag = -1;
  let bestScore = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    for (let i = lag; i < flux.length; i++) s += flux[i] * flux[i - lag];
    ac[lag] = s;
    const bpm = (60 * HOP_RATE) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / SIGMA, 2));
    const score = s * w;
    scoreSum += score;
    scoreCount++;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestScore <= 0) return { bpm: null, confidence: 0 };

  const meanScore = scoreSum / scoreCount;
  const confidence = Math.max(0, Math.min(1, 1 - meanScore / bestScore));

  // Interpolación parabólica para precisión sub-lag.
  let lag = bestLag;
  if (bestLag > lagMin && bestLag < lagMax) {
    const a = ac[bestLag - 1];
    const b = ac[bestLag];
    const c = ac[bestLag + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) {
      const delta = (0.5 * (a - c)) / denom;
      if (Math.abs(delta) < 1) lag = bestLag + delta;
    }
  }
  return { bpm: (60 * HOP_RATE) / lag, confidence };
}

/** Grilla de beats: período fijo (60/bpm) con la fase que maximiza el flux. */
export function beatGrid(bpm: number, flux: Float32Array, durationSec: number): number[] {
  const periodSec = 60 / bpm;
  if (!(periodSec > 0) || !(durationSec > 0)) return [];
  const steps = 64;
  let bestPhi = 0;
  let bestScore = -1;
  for (let s = 0; s < steps; s++) {
    const phi = (s / steps) * periodSec;
    let score = 0;
    for (let t = phi; t < durationSec; t += periodSec) {
      const h = Math.round(t * HOP_RATE);
      if (h >= 0 && h < flux.length) score += flux[h];
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhi = phi;
    }
  }
  const beats: number[] = [];
  for (let t = bestPhi; t < durationSec; t += periodSec) beats.push(t);
  return beats;
}

/** Onsets: picos del flux sobre umbral global (media + 1.5·σ) con no-máximos. */
export function pickOnsets(flux: Float32Array): number[] {
  if (flux.length === 0) return [];
  let mean = 0;
  for (let i = 0; i < flux.length; i++) mean += flux[i];
  mean /= flux.length;
  let varsum = 0;
  for (let i = 0; i < flux.length; i++) varsum += (flux[i] - mean) * (flux[i] - mean);
  const std = Math.sqrt(varsum / flux.length);
  const thr = mean + 1.5 * std;
  const minGap = Math.max(1, Math.ceil(0.05 * HOP_RATE)); // ~50 ms
  const onsets: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && i - last >= minGap) {
      onsets.push(i / HOP_RATE);
      last = i;
    }
  }
  return onsets;
}

/** Envolvente de energía normalizada 0..1, un valor por frame de proyecto. */
export function downsampleEnergy(rms: Float32Array, durationSec: number, fps: number): number[] {
  let max = 0;
  for (let i = 0; i < rms.length; i++) if (rms[i] > max) max = rms[i];
  const numFrames = Math.max(1, Math.round(durationSec * fps));
  const energy: number[] = new Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let h = Math.round((f / fps) * HOP_RATE);
    if (h >= rms.length) h = rms.length - 1;
    if (h < 0) h = 0;
    energy[f] = max > 0 && rms.length > 0 ? rms[h] / max : 0;
  }
  return energy;
}

/** Orquesta el análisis sobre muestras PCM mono (SR). PURO. */
export function analyzeSamples(samples: Float32Array, fps: number): BeatAnalysis {
  const durationSec = samples.length / SR;
  const rms = rmsPerHop(samples);
  const energy = downsampleEnergy(rms, durationSec, fps);
  if (rms.length < 8) return { bpm: null, confidence: 0, durationSec, beats: [], onsets: [], energy };

  const flux = energyFlux(rms);
  // Gate de energía ABSOLUTA: sin transientes (tono/ambiente plano) no hay ritmo,
  // aunque la autocorrelación relativa tenga estructura → no inventar BPM.
  let sumFlux = 0;
  let sumRms = 0;
  for (let i = 0; i < flux.length; i++) sumFlux += flux[i];
  for (let i = 0; i < rms.length; i++) sumRms += rms[i];
  const fluxStrength = sumRms > 0 ? sumFlux / sumRms : 0;
  const { bpm: rawBpm, confidence } = estimateBpm(flux);
  const bpm = rawBpm !== null && confidence >= 0.4 && fluxStrength >= 0.02 ? rawBpm : null;
  const beatsSec = bpm ? beatGrid(bpm, flux, durationSec) : [];
  const onsetsSec = pickOnsets(flux);
  const toFrames = (arr: number[]) => arr.map((t) => Math.round(t * fps));
  return {
    bpm: bpm !== null ? Math.round(bpm) : null,
    confidence,
    durationSec,
    beats: toFrames(beatsSec),
    onsets: toFrames(onsetsSec),
    energy,
  };
}
