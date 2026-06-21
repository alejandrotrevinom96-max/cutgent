import "server-only";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import ffmpegStatic from "ffmpeg-static";
import { resolveMediaInput } from "./media-source";
import { hasAudioStream, hasVideoStream } from "./audio-tools";
import { assetsDir } from "./paths";

/**
 * Normaliza el loudness de un audio (estándar broadcast EBU R128: I=-14 LUFS,
 * típico de YouTube) generando un nuevo archivo. 100% local con ffmpeg.
 */

const ASSETS_DIR = assetsDir();

const resolveInput = (src: string) => resolveMediaInput(src, ASSETS_DIR);

export async function normalizeAudio(
  src: string,
  opts: { i?: number; tp?: number; lra?: number } = {},
): Promise<{ id: string; src: string }> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no disponible");
  const { file, cleanup } = await resolveInput(src);
  try {
    if (!(await hasAudioStream(file))) throw new Error("El clip no tiene pista de audio.");
    const id = `asset_${nanoid(8)}`;
    // Conserva el video si la entrada lo tiene (no destruir el clip de video al
    // normalizar su audio); audio puro → .m4a con -vn.
    const keepVideo = await hasVideoStream(file);
    const ext = keepVideo ? "mp4" : "m4a";
    const outFile = path.join(ASSETS_DIR, `${id}.${ext}`);
    const i = opts.i ?? -14;
    const tp = opts.tp ?? -1;
    const lra = opts.lra ?? 11;
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    await runFfmpeg([
      "-y",
      "-i",
      file,
      "-af",
      `loudnorm=I=${i}:TP=${tp}:LRA=${lra}`,
      "-ar",
      "48000",
      ...(keepVideo ? ["-c:v", "copy"] : ["-vn"]),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outFile,
    ]);
    return { id, src: `/assets/${id}.${ext}` };
  } finally {
    if (cleanup) await cleanup();
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegStatic as string, args);
    let err = "";
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg salió ${code}: ${err.slice(-500)}`)),
    );
  });
}
