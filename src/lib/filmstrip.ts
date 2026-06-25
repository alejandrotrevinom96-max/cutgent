import "server-only";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

/**
 * Une N stills (nombrados contiguos: pattern=..._f%03d.ext, índices desde 0) en
 * UNA hoja de contactos con el filtro `tile` de ffmpeg, para que el agente
 * "perciba el movimiento" en una sola imagen. Sin drawtext (evita depender de
 * fuentes en ffmpeg-static/Windows). Patrón de spawn igual que chromakey/silences.
 */

export interface TileOptions {
  pattern: string; // ruta con %03d, índices contiguos desde 0
  output: string;
  cols: number;
  rows: number;
  thumbW: number; // ancho de cada miniatura (px)
}

export async function tileFrames(opts: TileOptions): Promise<void> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no está disponible.");
  const cols = Math.max(1, Math.round(opts.cols));
  const rows = Math.max(1, Math.round(opts.rows));
  const w = Math.max(16, Math.round(opts.thumbW));
  // -framerate 1 lee la secuencia como "vídeo"; tile agrupa cols*rows frames en 1.
  const vf = `scale=${w}:-1,tile=${cols}x${rows}:padding=4:margin=4:color=black`;
  await runFfmpeg(["-y", "-framerate", "1", "-i", opts.pattern, "-frames:v", "1", "-vf", vf, "-q:v", "3", opts.output]);
}

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegStatic as string, args);
    let err = "";
    proc.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg salió con código ${code}: ${err.slice(-600)}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Hoja de contactos del ARCHIVO fuente (footage crudo) — ffmpeg directo, sin
// Remotion: muestrea N frames equiespaciados del video y los tilea en 1 pasada.
// Para que el agente vea el material y elija la mejor toma.
// ---------------------------------------------------------------------------

export interface FootageSheetOptions {
  file: string; // ruta ABSOLUTA ya resuelta (resolveMediaInput)
  output: string; // ruta absoluta de salida (.jpg/.png)
  count?: number; // total de frames (def 12)
  columns?: number; // columnas (auto = ceil(sqrt(count)))
  width?: number; // ancho de miniatura px (def 280)
}

/** Lee la duración (seg) parseando el stderr de `ffmpeg -i` (mismo regex que silences). */
function probeDurationSec(file: string): Promise<number> {
  return new Promise((resolve) => {
    if (!ffmpegStatic) return resolve(0);
    const proc = spawn(ffmpegStatic, ["-i", file]);
    let err = "";
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", () => resolve(0));
    proc.on("close", () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0);
    });
  });
}

export async function footageContactSheet(
  opts: FootageSheetOptions,
): Promise<{ cols: number; rows: number; count: number; durationSec: number }> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no está disponible.");
  const count = Math.min(36, Math.max(2, Math.round(opts.count ?? 12)));
  const cols = Math.min(10, Math.max(1, Math.round(opts.columns ?? Math.ceil(Math.sqrt(count)))));
  const rows = Math.ceil(count / cols);
  const gridN = cols * rows; // tile exige EXACTAMENTE cols*rows frames
  const w = Math.min(640, Math.max(80, Math.round(opts.width ?? 280)));

  const duration = await probeDurationSec(opts.file);
  if (!(duration > 0.1)) throw new Error("No se pudo leer la duración (archivo corto/corrupto).");

  // fps fraccional: gridN frames repartidos en toda la duración; -0.001 para que el
  // último sample caiga DENTRO del archivo (evita 1 frame de menos → tile incompleto).
  const fps = gridN / Math.max(0.2, duration - 0.001);
  const vf = `fps=${fps},scale=${w}:-1,tile=${cols}x${rows}:padding=4:margin=4:color=black`;
  await runFfmpeg(["-y", "-i", opts.file, "-vf", vf, "-frames:v", "1", "-q:v", "3", opts.output]);

  return { cols, rows, count: gridN, durationSec: duration };
}
