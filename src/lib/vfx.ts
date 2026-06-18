import "server-only";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import ffmpegStatic from "ffmpeg-static";
import { resolveMediaInput } from "./media-source";
import { assetsDir } from "./paths";

/**
 * Procesado de video "pro" 100% local con ffmpeg: estabilización (vidstab,
 * 2 pasadas), LUT 3D (.cube), reducción de ruido (hqdn3d) y enfoque (unsharp).
 * Genera un asset nuevo (mp4) y el llamador intercambia el src del clip.
 *
 * NOTA Windows: las rutas dentro de un filtro de ffmpeg rompen el parser
 * (los ':' de la unidad y las '\'). Para los filtros que referencian archivos
 * (vidstab .trf, lut .cube) ejecutamos con cwd = carpeta de assets y usamos
 * nombres RELATIVOS y limpios.
 */

const ASSETS_DIR = assetsDir();

export type VfxOp = "stabilize" | "lut" | "denoise" | "sharpen";
export interface VfxParams {
  lutPath?: string;
  shakiness?: number;
  smoothing?: number;
  strength?: number;
  amount?: number;
}

const clamp = (v: number | undefined, min: number, max: number, def: number) =>
  typeof v === "number" ? Math.min(max, Math.max(min, v)) : def;

const resolveInput = (src: string) => resolveMediaInput(src, ASSETS_DIR);

function runFfmpeg(args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) return reject(new Error("ffmpeg-static no disponible"));
    const proc = spawn(ffmpegStatic, args, cwd ? { cwd } : {});
    let err = "";
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg salió ${code}: ${err.slice(-500)}`)),
    );
  });
}

const ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "copy"];

// ---------------------------------------------------------------------------
// Encode por GPU (opt-in, $0). Detección robusta: listar -encoders + encode de
// prueba de 1 frame (que aparezca listado NO garantiza que funcione: driver /
// iGPU deshabilitada). Resultado cacheado. Vendor: NVIDIA > Intel > AMD > CPU.
// NOTA: en Remotion/Windows el cuello de botella es el render de frames en
// Chromium, no el encode → el transcode GPU solo ayuda de forma situacional.
// ---------------------------------------------------------------------------

export type GpuEncoder = "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264";

let gpuEncoderCache: GpuEncoder | null = null;

function ffmpegStdout(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    if (!ffmpegStatic) return resolve("");
    const proc = spawn(ffmpegStatic, args);
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (out += d.toString()));
    proc.on("error", () => resolve(""));
    proc.on("close", () => resolve(out));
  });
}

function testEncode(encoder: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ffmpegStatic) return resolve(false);
    const proc = spawn(ffmpegStatic, [
      "-hide_banner", "-f", "lavfi", "-i", "nullsrc=s=64x64:d=0.1",
      "-frames:v", "1", "-c:v", encoder, "-f", "null", "-",
    ]);
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/** Detecta el mejor encoder por hardware disponible (cacheado). */
export async function detectGpuEncoder(): Promise<GpuEncoder> {
  if (gpuEncoderCache) return gpuEncoderCache;
  const list = await ffmpegStdout(["-hide_banner", "-encoders"]);
  const candidates: GpuEncoder[] = ["h264_nvenc", "h264_qsv", "h264_amf"];
  for (const enc of candidates) {
    if (new RegExp(`\\b${enc}\\b`).test(list) && (await testEncode(enc))) {
      gpuEncoderCache = enc;
      return enc;
    }
  }
  gpuEncoderCache = "libx264";
  return "libx264";
}

type GpuQuality = "high" | "balanced" | "fast";
// QP por nivel de calidad (≈ CRF 18/23/28). Mismo orden de magnitud por encoder.
const QP_BY_QUALITY: Record<GpuQuality, number> = { high: 18, balanced: 23, fast: 28 };

function gpuQualityArgs(encoder: GpuEncoder, quality: GpuQuality): string[] {
  const qp = QP_BY_QUALITY[quality];
  switch (encoder) {
    case "h264_nvenc":
      return ["-preset", "p4", "-cq", String(qp)];
    case "h264_qsv":
      return ["-global_quality", String(qp)];
    case "h264_amf":
      return ["-rc", "cqp", "-qp_i", String(qp), "-qp_p", String(qp)];
    case "libx264":
    default:
      return ["-preset", "medium", "-crf", String(qp)];
  }
}

/**
 * Transcodea un mp4 (salida de Remotion) con un encoder por hardware. Copia el
 * audio (sin recodificar). Devuelve true si tuvo éxito. Pensado para usarse de
 * forma opt-in tras el render.
 */
export async function transcodeWithEncoder(
  input: string,
  output: string,
  encoder: GpuEncoder,
  quality: GpuQuality = "balanced",
): Promise<boolean> {
  try {
    await runFfmpeg([
      "-y", "-i", input, "-c:v", encoder, ...gpuQualityArgs(encoder, quality),
      "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", output,
    ]);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Proxy de baja resolución (540p) para preview fluido. El render usa el
// original. scale=-2:540 mantiene aspecto y fuerza ancho par (libx264/yuv420p).
// ---------------------------------------------------------------------------

export async function makeProxy(src: string): Promise<{ id: string; src: string }> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no disponible");
  const { file, cleanup } = await resolveInput(src);
  try {
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    const id = `asset_${nanoid(8)}_proxy`;
    const out = path.join(ASSETS_DIR, `${id}.mp4`);
    await runFfmpeg([
      "-y", "-i", file, "-vf", "scale=-2:540", "-c:v", "libx264",
      "-preset", "veryfast", "-crf", "28", "-movflags", "+faststart",
      "-c:a", "aac", "-b:a", "128k", out,
    ]);
    return { id, src: `/assets/${id}.mp4` };
  } finally {
    if (cleanup) await cleanup();
  }
}

export async function processVfx(
  src: string,
  op: VfxOp,
  params: VfxParams = {},
): Promise<{ id: string; src: string }> {
  if (!ffmpegStatic) throw new Error("ffmpeg-static no disponible");
  const { file, cleanup } = await resolveInput(src);
  try {
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    const id = `asset_${nanoid(8)}`;
    const out = path.join(ASSETS_DIR, `${id}.mp4`);

    if (op === "stabilize") {
      const trf = `_stab_${nanoid(6)}.trf`;
      const shakiness = clamp(params.shakiness, 1, 10, 6);
      const smoothing = clamp(params.smoothing, 0, 100, 15);
      try {
        await runFfmpeg(
          ["-y", "-i", file, "-vf", `vidstabdetect=shakiness=${shakiness}:accuracy=15:result=${trf}`, "-f", "null", "-"],
          ASSETS_DIR,
        );
        await runFfmpeg(
          ["-y", "-i", file, "-vf", `vidstabtransform=input=${trf}:smoothing=${smoothing}:optzoom=1,unsharp=5:5:0.8:3:3:0.4`, ...ENC, out],
          ASSETS_DIR,
        );
      } finally {
        await fs.unlink(path.join(ASSETS_DIR, trf)).catch(() => {});
      }
    } else if (op === "lut") {
      if (!params.lutPath || typeof params.lutPath !== "string" || !/\.cube$/i.test(params.lutPath)) {
        throw new Error("lutPath debe ser un archivo .cube válido.");
      }
      // Las rutas RELATIVAS se confinan a public/assets (sin traversal). Las
      // ABSOLUTAS son archivos del propio dueño (own-it) → permitidas si existen.
      const lutAbs = path.isAbsolute(params.lutPath)
        ? params.lutPath
        : path.resolve(ASSETS_DIR, params.lutPath);
      if (!path.isAbsolute(params.lutPath) && !lutAbs.startsWith(ASSETS_DIR + path.sep)) {
        throw new Error("Ruta de LUT no permitida (fuera de assets).");
      }
      const cube = `_lut_${nanoid(6)}.cube`;
      await fs.writeFile(path.join(ASSETS_DIR, cube), await fs.readFile(lutAbs));
      try {
        await runFfmpeg(["-y", "-i", file, "-vf", `lut3d=${cube}`, ...ENC, out], ASSETS_DIR);
      } finally {
        await fs.unlink(path.join(ASSETS_DIR, cube)).catch(() => {});
      }
    } else if (op === "denoise") {
      const s = clamp(params.strength, 0, 10, 4);
      await runFfmpeg(["-y", "-i", file, "-vf", `hqdn3d=${s}:${s}:${s * 1.5}:${s * 1.5}`, ...ENC, out]);
    } else if (op === "sharpen") {
      const a = clamp(params.amount, 0, 3, 1);
      await runFfmpeg(["-y", "-i", file, "-vf", `unsharp=5:5:${a}:5:5:0`, ...ENC, out]);
    } else {
      throw new Error(`Operación VFX desconocida: ${op}`);
    }

    return { id, src: `/assets/${id}.mp4` };
  } finally {
    if (cleanup) await cleanup();
  }
}
