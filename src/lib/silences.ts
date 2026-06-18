import "server-only";
import { spawn } from "child_process";
import path from "path";
import ffmpegStatic from "ffmpeg-static";
import { resolveMediaInput } from "./media-source";
import { assetsDir } from "./paths";

/**
 * Detección de silencios 100% local con ffmpeg (silencedetect). Devuelve los
 * rangos de silencio en SEGUNDOS de la fuente. Base del auto-corte de pausas
 * (jump-cut) que más tiempo ahorra editando un YouTube hablado.
 */

const ASSETS_DIR = assetsDir();

export interface SilenceRange {
  start: number;
  end: number;
}

export async function detectSilences(
  src: string,
  opts: { noiseDb?: number; minDurSec?: number } = {},
): Promise<{ silences: SilenceRange[] }> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no disponible");
  // Saneo: ffmpeg interpola estos valores en el filtro; clamp a rangos válidos.
  const clamp = (v: number | undefined, lo: number, hi: number, def: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
  const noiseDb = clamp(opts.noiseDb, -90, 0, -30);
  const minDur = clamp(opts.minDurSec, 0.05, 30, 0.4);
  const { file, cleanup } = await resolveMediaInput(src, ASSETS_DIR);
  try {
    const stderr = await new Promise<string>((resolve, reject) => {
      const proc = spawn(ffmpegStatic as string, [
        "-i", file,
        "-af", `silencedetect=noise=${noiseDb}dB:d=${minDur}`,
        "-f", "null", "-",
      ]);
      let err = "";
      proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
      proc.on("error", reject);
      proc.on("close", () => resolve(err));
    });

    // Duración total (para cerrar un silencio que llega hasta el final del audio).
    let durationSec: number | null = null;
    const dm = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (dm) durationSec = +dm[1] * 3600 + +dm[2] * 60 + parseFloat(dm[3]);

    const silences: SilenceRange[] = [];
    let pendingStart: number | null = null;
    for (const line of stderr.split("\n")) {
      const ms = line.match(/silence_start:\s*(-?[\d.]+)/);
      if (ms) pendingStart = parseFloat(ms[1]);
      const me = line.match(/silence_end:\s*(-?[\d.]+)/);
      if (me && pendingStart != null) {
        silences.push({ start: Math.max(0, pendingStart), end: parseFloat(me[1]) });
        pendingStart = null;
      }
    }
    // Silencio que termina junto con el audio: ffmpeg emite silence_start sin end.
    if (pendingStart != null && durationSec != null && durationSec > pendingStart) {
      silences.push({ start: Math.max(0, pendingStart), end: durationSec });
    }
    return { silences };
  } finally {
    if (cleanup) await cleanup();
  }
}
