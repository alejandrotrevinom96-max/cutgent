import "server-only";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { resolveMediaInput } from "./media-source";
import { assetsDir } from "./paths";
import { SR, analyzeSamples, type BeatAnalysis } from "./beats-dsp";

/**
 * Análisis de audio (beats/BPM/onsets/energía) 100% local con ffmpeg, sin key.
 * Decodifica PCM mono a SR (beats-dsp) por stdout — clon de decodeMono de
 * waveform.ts — y delega el DSP puro a beats-dsp.ts. Frames devueltos relativos
 * a la FUENTE (a `fps`); el mapeo a timeline lo hace el tool MCP con el clip.
 */

function decodeMono(file: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) return reject(new Error("ffmpeg-static no disponible"));
    const proc = spawn(ffmpegStatic, ["-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"]);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", () => {});
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) return resolve(new Float32Array(0));
      const buf = Buffer.concat(chunks);
      const usable = buf.length - (buf.length % 4); // Float32 exige múltiplo de 4
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + usable);
      resolve(new Float32Array(ab));
    });
  });
}

export async function analyzeBeats(src: string, opts: { fps?: number } = {}): Promise<BeatAnalysis> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no disponible");
  const fps = opts.fps && opts.fps > 0 ? opts.fps : 30;
  const { file, cleanup } = await resolveMediaInput(src, assetsDir());
  try {
    const samples = await decodeMono(file);
    if (samples.length === 0) throw new Error("El clip no tiene pista de audio.");
    return analyzeSamples(samples, fps);
  } finally {
    if (cleanup) await cleanup();
  }
}
