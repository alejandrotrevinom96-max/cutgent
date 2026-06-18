import "server-only";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import ffmpegStatic from "ffmpeg-static";
import { resolveMediaInput } from "./media-source";
import { dataDir } from "./paths";

/**
 * Extrae la envolvente (picos) del audio de un asset para dibujar el waveform
 * en la timeline. 100% local con ffmpeg; el resultado se cachea en disco.
 */

const WAVE_DIR = dataDir("waveforms");
const DEFAULT_BUCKETS = 600;

const resolveInput = (src: string) => resolveMediaInput(src, WAVE_DIR);

const cacheFile = (src: string, buckets: number) =>
  path.join(WAVE_DIR, `${crypto.createHash("md5").update(`${src}|${buckets}`).digest("hex")}.json`);

export async function getWaveform(src: string, buckets = DEFAULT_BUCKETS): Promise<number[]> {
  try {
    const cached = await fs.readFile(cacheFile(src, buckets), "utf8");
    return JSON.parse(cached) as number[];
  } catch {
    /* compute */
  }

  const { file, cleanup } = await resolveInput(src);
  try {
    const samples = await decodeMono(file);
    const peaks = computePeaks(samples, buckets);
    await fs.mkdir(WAVE_DIR, { recursive: true });
    await fs.writeFile(cacheFile(src, buckets), JSON.stringify(peaks), "utf8");
    return peaks;
  } finally {
    if (cleanup) await cleanup();
  }
}

function decodeMono(file: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) return reject(new Error("ffmpeg-static no disponible"));
    // 8 kHz mono basta para la envolvente y es rápido.
    const proc = spawn(ffmpegStatic, ["-i", file, "-ac", "1", "-ar", "8000", "-f", "f32le", "-"]);
    const chunks: Buffer[] = [];
    let err = "";
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      // Sin pista de audio o fallo → vacío (no es fatal para el waveform).
      if (code !== 0 || chunks.length === 0) return resolve(new Float32Array(0));
      const buf = Buffer.concat(chunks);
      // Float32Array exige longitud múltiplo de 4: recortamos el sobrante.
      const usable = buf.length - (buf.length % 4);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + usable);
      resolve(new Float32Array(ab));
    });
  });
}

function computePeaks(samples: Float32Array, buckets: number): number[] {
  if (samples.length === 0) return [];
  const out: number[] = new Array(buckets).fill(0);
  const size = samples.length / buckets;
  let max = 0;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * size);
    const end = Math.min(samples.length, Math.floor((i + 1) * size));
    let peak = 0;
    for (let j = start; j < end; j++) {
      const a = Math.abs(samples[j]);
      if (a > peak) peak = a;
    }
    out[i] = peak;
    if (peak > max) max = peak;
  }
  // Normalizar a 0..1.
  if (max > 0) for (let i = 0; i < buckets; i++) out[i] = out[i] / max;
  return out;
}
