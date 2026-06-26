import "server-only";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import { selectComposition, renderMedia, ensureBrowser } from "@remotion/renderer";
import type { Codec, ProResProfile, AudioCodec } from "@remotion/renderer";
import { updateJob } from "@/lib/render-jobs";
import { absolutizeAssets, bundleRemotion } from "@/lib/remotion-bundle";
import { rendersDir as rendersDirPath } from "@/lib/paths";
import { resolveExportFormat, QUALITY_CRF, type ExportQuality } from "@/lib/export-formats";
import { detectGpuEncoder, transcodeWithEncoder } from "@/lib/vfx";
import { shouldWatermark } from "@/lib/license";
import type { Project } from "@/lib/schema";

/**
 * Pipeline de render con Remotion. Vive en un lib (NO en el route) porque Next 15
 * solo permite exportar handlers + config desde un archivo de ruta; lo consumen
 * /api/render (un job) y /api/render/batch (lote con bundle compartido).
 */

// Bitrate objetivo por calidad para encode con GPU. CRF es incompatible con la
// aceleración por hardware (Remotion la desactiva), así que con gpu:true pasamos
// videoBitrate en vez de crf para que el HW encoder pueda engancharse.
const QUALITY_BITRATE: Record<ExportQuality, string> = {
  high: "8000k",
  balanced: "5000k",
  fast: "2500k",
};

export interface RenderOpts {
  format?: string;
  quality?: ExportQuality;
  gpu?: boolean;
  /** Override de dimensiones (export por lotes multi-resolución). */
  width?: number;
  height?: number;
  /** Export rápido de previsualización: media resolución + encode veloz, sin
   *  transcode GPU. NO usar para el entregable final. */
  draft?: boolean;
  /** Backend GL de Chromium para rasterizar (default 'angle' = GPU). */
  gl?: "angle" | "angle-egl" | "swangle" | "swiftshader" | "egl" | "vulkan";
  /** Rango de frames a renderizar [in, out]. Omitido → composición completa. */
  frameRange?: [number, number];
}

/** Contexto opcional para reusar un bundle de Remotion entre renders (batch). */
export interface RenderCtx {
  serveUrl?: string;
  watermark?: boolean;
  onProgress?: (p: number) => void;
}

/** Pipeline de render completo para un trabajo. Nunca lanza: captura todo.
 *  ctx (opcional) reusa un bundle compartido (export por lotes) y NO lo borra. */
export async function runRender(
  jobId: string,
  rawDocument: Project,
  origin: string,
  opts: RenderOpts,
  ctx?: RenderCtx,
): Promise<void> {
  const ownsBundle = !ctx?.serveUrl;
  let serveUrl: string | undefined = ctx?.serveUrl;
  const spec = resolveExportFormat(opts.format);
  try {
    // width/height son ambos-o-ninguno: pasar solo uno se ignoraba en silencio.
    if (!!opts.width !== !!opts.height) {
      throw new Error("width y height deben indicarse juntos (ambos o ninguno).");
    }
    // Override de dims (batch multi-resolución) antes de absolutizar.
    const sized =
      opts.width && opts.height ? { ...rawDocument, width: opts.width, height: opts.height } : rawDocument;
    const document = absolutizeAssets(sized, origin);
    if (ownsBundle) {
      await ensureBrowser();
      serveUrl = await bundleRemotion();
    }

    // Gate SERVER-SIDE: sin licencia válida → marca de agua en el deliverable.
    // El flag NO se lee del body del cliente; fail-closed (watermark) ante error.
    const watermark = ctx?.watermark ?? (await shouldWatermark());
    const inputProps = { document, watermark };
    const composition = await selectComposition({ serveUrl: serveUrl!, id: "MainVideo", inputProps });

    // Rango I/O opcional: clampamos a [0, duración-1] y exigimos in < out.
    let frameRange: [number, number] | undefined;
    if (opts.frameRange) {
      const last = Math.max(0, composition.durationInFrames - 1);
      const a = Math.max(0, Math.min(last, Math.round(opts.frameRange[0])));
      const b = Math.max(0, Math.min(last, Math.round(opts.frameRange[1])));
      const from = Math.min(a, b);
      const to = Math.max(a, b);
      if (to > from) frameRange = [from, to];
    }

    const rendersDir = rendersDirPath();
    await fs.mkdir(rendersDir, { recursive: true });
    const outputLocation = path.join(rendersDir, `${jobId}.${spec.ext}`);

    // Calidad: por defecto CRF (software, mejor relación calidad/tamaño). Con GPU
    // (gpu:true, solo h264) usamos videoBitrate porque CRF es INCOMPATIBLE con la
    // codificación por hardware (Remotion la desactiva con un warning).
    const draft = !!opts.draft;
    // En draft NO transcodeamos por GPU (segundo pase): priorizamos velocidad.
    const useGpuEncode = !!opts.gpu && spec.codec === "h264" && !draft;
    const crf =
      draft && (spec.codec === "h264" || spec.codec === "vp9")
        ? 30 // draft: crf alto = encode rápido y archivo chico (solo preview)
        : !useGpuEncode && opts.quality && (spec.codec === "h264" || spec.codec === "vp9")
          ? QUALITY_CRF[opts.quality]
          : undefined;
    const videoBitrate = useGpuEncode ? QUALITY_BITRATE[opts.quality ?? "balanced"] : undefined;

    await renderMedia({
      composition,
      serveUrl: serveUrl!,
      codec: spec.codec as Codec,
      outputLocation,
      inputProps,
      ...(spec.proResProfile ? { proResProfile: spec.proResProfile as ProResProfile } : {}),
      ...(spec.audioCodec ? { audioCodec: spec.audioCodec as AudioCodec } : {}),
      ...(crf != null ? { crf } : {}),
      ...(videoBitrate != null ? { videoBitrate } : {}),
      ...(frameRange ? { frameRange } : {}),
      // CLAVE de perf: 'angle' usa la GPU para rasterizar filtros CSS/transform.
      chromiumOptions: { gl: opts.gl ?? "angle" },
      imageFormat: "jpeg", // default explícito (el más rápido)
      // Draft: media resolución (~4x menos píxeles) + encode veloz + jpeg intermedio
      // más liviano (menos serialización Chrome→encoder). Solo afecta el preview.
      ...(draft ? { scale: 0.5, x264Preset: "veryfast" as const, jpegQuality: 55 } : {}),
      // if-possible: acelera en macOS/VideoToolbox; inocuo (no rompe) en Windows.
      hardwareAcceleration: "if-possible",
      // Cache de frames de video EXPLÍCITO (en vez del auto ~50% RAM) para coexistir
      // con los workers de concurrency sin thrashing; mayor en el final (video largo).
      offthreadVideoCacheSizeInBytes: draft ? 512 * 1024 * 1024 : 1536 * 1024 * 1024,
      // draft: cpus-1 (frames chicos, RAM baja); final: cpus-2 (deja margen al sistema).
      concurrency: Math.max(2, os.cpus().length - (draft ? 1 : 2)),
      onProgress: ({ progress }) => {
        // Reserva el último 5% para el transcode GPU (solo si va a ocurrir).
        const p = useGpuEncode ? progress * 0.95 : progress;
        updateJob(jobId, { progress: p });
        ctx?.onProgress?.(p);
      },
    });

    let finalUrl = `/renders/${jobId}.${spec.ext}`;

    // Encode GPU opt-in (solo h264/mp4, NO en draft): transcodea con nvenc/qsv/amf.
    if (useGpuEncode) {
      const encoder = await detectGpuEncoder();
      if (encoder !== "libx264") {
        const gpuOut = path.join(rendersDir, `${jobId}_gpu.${spec.ext}`);
        const okGpu = await transcodeWithEncoder(outputLocation, gpuOut, encoder, opts.quality);
        if (okGpu) {
          await fs.rm(outputLocation, { force: true }).catch(() => {});
          finalUrl = `/renders/${jobId}_gpu.${spec.ext}`;
        }
      }
    }

    updateJob(jobId, { status: "done", progress: 1, url: finalUrl });
  } catch (err) {
    updateJob(jobId, { status: "error", error: err instanceof Error ? err.message : String(err) });
  } finally {
    // Solo borra el bundle si ES NUESTRO (en batch lo borra el orquestador).
    if (ownsBundle && serveUrl) await fs.rm(serveUrl, { recursive: true, force: true }).catch(() => {});
  }
}
