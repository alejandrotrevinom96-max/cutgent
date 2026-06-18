import "server-only";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import ffmpegStatic from "ffmpeg-static";
import { resolveMediaInput } from "./media-source";
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
    const id = `asset_${nanoid(8)}`;
    const outFile = path.join(ASSETS_DIR, `${id}.m4a`);
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
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-vn",
      outFile,
    ]);
    return { id, src: `/assets/${id}.m4a` };
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
