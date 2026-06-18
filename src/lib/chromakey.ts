import "server-only";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import ffmpegStatic from "ffmpeg-static";
import { resolveMediaInput } from "./media-source";
import { assetsDir } from "./paths";

/**
 * Chroma key (pantalla verde) por preprocesado con ffmpeg. CSS no puede quitar
 * un color; aquí generamos un WebM con canal alfa (VP9, yuva420p) que Remotion
 * reproduce con transparencia tanto en el preview como en el render.
 */

const ASSETS_DIR = assetsDir();

const resolveInput = (src: string) => resolveMediaInput(src, ASSETS_DIR);

export interface ChromaKeyOptions {
  /** Color a eliminar (hex ffmpeg, p.ej. 0x00FF00 o "green"). */
  color?: string;
  /** 0.01..1.0 — cuán parecido al color para volverse transparente. */
  similarity?: number;
  /** 0..1 — suavizado del borde. */
  blend?: number;
}

export interface ChromaKeyResult {
  id: string;
  src: string;
}

export async function processChromaKey(
  src: string,
  opts: ChromaKeyOptions = {},
): Promise<ChromaKeyResult> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no está disponible.");
  const { file, cleanup } = await resolveInput(src);
  try {
    const id = `asset_${nanoid(8)}`;
    const outFile = path.join(ASSETS_DIR, `${id}.webm`);
    // Sanitiza para evitar inyección en el filtergraph de ffmpeg.
    const color = opts.color ?? "0x00FF00";
    if (!/^(0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}|[a-zA-Z]{3,20})$/.test(color)) {
      throw new Error("Color de chroma inválido (usa 0xRRGGBB, #RRGGBB o un nombre).");
    }
    const clampNum = (v: unknown, min: number, max: number, def: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
    const similarity = clampNum(opts.similarity, 0.01, 1, 0.3);
    const blend = clampNum(opts.blend, 0, 1, 0.1);
    const vf = `chromakey=${color}:${similarity}:${blend},format=yuva420p`;
    // VP8 (libvpx) con yuva420p es la vía fiable para WebM con canal alfa
    // (VP9 alpha en ffmpeg suele caer a yuv420p y pierde la transparencia).
    await runFfmpeg([
      "-y",
      "-i",
      file,
      "-vf",
      vf,
      "-c:v",
      "libvpx",
      "-pix_fmt",
      "yuva420p",
      "-auto-alt-ref",
      "0",
      "-crf",
      "12",
      "-b:v",
      "1M",
      "-an",
      outFile,
    ]);
    return { id, src: `/assets/${id}.webm` };
  } finally {
    if (cleanup) await cleanup();
  }
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
