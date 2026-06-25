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

function runFfmpeg(args: string[]): Promise<void> {
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
