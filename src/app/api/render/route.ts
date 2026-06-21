import { NextResponse } from "next/server";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import { selectComposition, renderMedia, ensureBrowser } from "@remotion/renderer";
import type { Codec, ProResProfile, AudioCodec } from "@remotion/renderer";
import { getDocument } from "@/lib/server-store";
import { newId } from "@/lib/factory";
import { createJob, updateJob } from "@/lib/render-jobs";
import { absolutizeAssets, bundleRemotion } from "@/lib/remotion-bundle";
import { rendersDir as rendersDirPath } from "@/lib/paths";
import { resolveExportFormat, QUALITY_CRF, type ExportQuality } from "@/lib/export-formats";
import { detectGpuEncoder, transcodeWithEncoder } from "@/lib/vfx";
import { shouldWatermark } from "@/lib/license";
import type { Project } from "@/lib/schema";

// Bitrate objetivo por calidad para encode con GPU. CRF es incompatible con la
// aceleración por hardware (Remotion la desactiva), así que con gpu:true pasamos
// videoBitrate en vez de crf para que el HW encoder pueda engancharse.
const QUALITY_BITRATE: Record<ExportQuality, string> = {
  high: "8000k",
  balanced: "5000k",
  fast: "2500k",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RenderOpts {
  format?: string;
  quality?: ExportQuality;
  gpu?: boolean;
  /** Override de dimensiones (export por lotes multi-resolución). */
  width?: number;
  height?: number;
}

/** Contexto opcional para reusar un bundle de Remotion entre renders (batch). */
export interface RenderCtx {
  serveUrl?: string;
  watermark?: boolean;
  onProgress?: (p: number) => void;
}

/**
 * POST /api/render  { format?, quality?, gpu? }
 * Toma el documento autoritativo actual y lanza un render EN SEGUNDO PLANO con
 * Remotion. Responde con { jobId }; el progreso se consulta en
 * GET /api/render/status?id=<jobId>. El formato decide códec + extensión.
 *
 * NOTA: el PRIMER render descarga Chromium (Chrome Headless Shell).
 */
export async function POST(req: Request) {
  try {
    const document = await getDocument();
    const opts: RenderOpts = await req.json().catch(() => ({}));
    const jobId = newId("render");
    createJob(jobId);

    const origin = new URL(req.url).origin;
    void runRender(jobId, document, origin, opts);

    return NextResponse.json({ jobId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
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

    const rendersDir = rendersDirPath();
    await fs.mkdir(rendersDir, { recursive: true });
    const outputLocation = path.join(rendersDir, `${jobId}.${spec.ext}`);

    // Calidad: por defecto CRF (software, mejor relación calidad/tamaño). Con GPU
    // (gpu:true, solo h264) usamos videoBitrate porque CRF es INCOMPATIBLE con la
    // codificación por hardware (Remotion la desactiva con un warning) → así el
    // HW encoder (VideoToolbox en mac) puede engancharse.
    const useGpuEncode = !!opts.gpu && spec.codec === "h264";
    const crf =
      !useGpuEncode && opts.quality && (spec.codec === "h264" || spec.codec === "vp9")
        ? QUALITY_CRF[opts.quality]
        : undefined;
    // Con GPU siempre fijamos un bitrate (default 'balanced' si no se indicó
    // calidad) para no renderizar sin control de calidad ni crf.
    const videoBitrate = useGpuEncode ? QUALITY_BITRATE[opts.quality ?? "balanced"] : undefined;

    await renderMedia({
      composition,
      serveUrl: serveUrl!,
      codec: spec.codec as Codec,
      outputLocation,
      inputProps,
      // ProRes solo con su profile; gif no lleva audio. Spread condicional.
      ...(spec.proResProfile ? { proResProfile: spec.proResProfile as ProResProfile } : {}),
      ...(spec.audioCodec ? { audioCodec: spec.audioCodec as AudioCodec } : {}),
      ...(crf != null ? { crf } : {}),
      ...(videoBitrate != null ? { videoBitrate } : {}),
      // if-possible: acelera en macOS/VideoToolbox; inocuo (no rompe) en Windows.
      hardwareAcceleration: "if-possible",
      concurrency: Math.max(2, os.cpus().length - 2),
      onProgress: ({ progress }) => {
        // Reserva el último 5% para un posible transcode GPU.
        const p = opts.gpu && spec.codec === "h264" ? progress * 0.95 : progress;
        updateJob(jobId, { progress: p });
        ctx?.onProgress?.(p);
      },
    });

    let finalUrl = `/renders/${jobId}.${spec.ext}`;

    // Encode GPU opt-in (solo h264/mp4): transcodea la salida con nvenc/qsv/amf.
    if (opts.gpu && spec.codec === "h264") {
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
    updateJob(jobId, {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    // Solo borra el bundle si ES NUESTRO (en batch lo borra el orquestador).
    if (ownsBundle && serveUrl) await fs.rm(serveUrl, { recursive: true, force: true }).catch(() => {});
  }
}
