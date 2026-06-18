import "server-only";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import ffmpegStatic from "ffmpeg-static";
import { resolveMediaInput } from "./media-source";
import { assetsDir } from "./paths";

/**
 * Herramientas de audio 100% locales con ffmpeg: limpieza de voz (reducción de
 * ruido FFT + filtros + de-esser) y medición de loudness (ebur128). Voz limpia
 * y nivel correcto = lo que más sube la calidad percibida de un canal hablado.
 */

const ASSETS_DIR = assetsDir();
const resolveInput = (src: string) => resolveMediaInput(src, ASSETS_DIR);

function runCapture(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) return reject(new Error("ffmpeg-static no disponible"));
    const proc = spawn(ffmpegStatic, args);
    let err = "";
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 || code === null ? resolve(err) : reject(new Error(`ffmpeg salió ${code}: ${err.slice(-400)}`)),
    );
  });
}

export interface CleanAudioOpts {
  /** Reducción de ruido FFT (afftdn). */
  denoise?: boolean;
  /** Corte de graves (Hz) para quitar zumbido/rumble. */
  highpass?: number;
  /** Corte de agudos (Hz). */
  lowpass?: number;
  /** De-esser suave (atenúa sibilancias ~6 kHz). */
  deEss?: boolean;
}

/** Limpia la voz de un audio/video y devuelve un asset de audio nuevo (.m4a). */
export async function cleanAudio(
  src: string,
  opts: CleanAudioOpts = {},
): Promise<{ id: string; src: string }> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no disponible");
  const { file, cleanup } = await resolveInput(src);
  try {
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    const id = `asset_${nanoid(8)}`;
    const out = path.join(ASSETS_DIR, `${id}.m4a`);

    const chain: string[] = [];
    if (opts.highpass !== undefined) chain.push(`highpass=f=${Math.round(opts.highpass)}`);
    else chain.push("highpass=f=80");
    if (opts.denoise !== false) chain.push("afftdn=nr=12:nf=-25");
    if (opts.deEss) chain.push("deesser=i=0.4");
    if (opts.lowpass !== undefined) chain.push(`lowpass=f=${Math.round(opts.lowpass)}`);

    await runCapture(["-y", "-i", file, "-af", chain.join(","), "-c:a", "aac", "-b:a", "192k", "-vn", out]);
    return { id, src: `/assets/${id}.m4a` };
  } finally {
    if (cleanup) await cleanup();
  }
}

export interface Loudness {
  integratedLufs: number | null;
  truePeakDb: number | null;
  lra: number | null;
  /** Diferencia respecto al objetivo de YouTube (-14 LUFS). */
  vsYouTube: number | null;
}

/** Mide el loudness integrado real (ebur128) de un audio/video. */
export async function measureLoudness(src: string): Promise<Loudness> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no disponible");
  const { file, cleanup } = await resolveInput(src);
  try {
    const err = await runCapture(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
    // Parse del resumen final de ebur128.
    const num = (re: RegExp): number | null => {
      const m = err.match(re);
      return m ? parseFloat(m[1]) : null;
    };
    const integratedLufs = num(/I:\s*(-?[\d.]+)\s*LUFS/);
    const truePeakDb = num(/Peak:\s*(-?[\d.]+)\s*dBFS/);
    const lra = num(/LRA:\s*(-?[\d.]+)\s*LU/);
    return {
      integratedLufs,
      truePeakDb,
      lra,
      vsYouTube: integratedLufs != null ? Number((integratedLufs - -14).toFixed(1)) : null,
    };
  } finally {
    if (cleanup) await cleanup();
  }
}
