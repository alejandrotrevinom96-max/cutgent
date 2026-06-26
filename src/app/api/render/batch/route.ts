import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { ensureBrowser } from "@remotion/renderer";
import { getDocument } from "@/lib/server-store";
import { newId } from "@/lib/factory";
import { createJob, createBatch, updateBatchItem, getJob, getBatch, setBatchStatus, type BatchItem } from "@/lib/render-jobs";
import { bundleRemotion } from "@/lib/remotion-bundle";
import { SOCIAL_PRESETS, type SocialPreset } from "@/lib/export-formats";
import { shouldWatermark } from "@/lib/license";
import { runRender } from "@/lib/render-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/render/batch  { presetIds?: string[]; items?: SocialPreset-like[] }
 * Exporta a VARIOS formatos/resoluciones en serie reusando UN solo bundle de
 * Remotion. Responde { batchId, jobIds } y procesa en segundo plano.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      presetIds?: string[];
      items?: Partial<SocialPreset>[];
    };
    const fromPresets = (body.presetIds ?? [])
      .map((id) => SOCIAL_PRESETS.find((p) => p.id === id))
      .filter((p): p is SocialPreset => !!p);
    const fromItems = (body.items ?? []).map((it, i) => ({
      id: it.id ?? `item${i}`,
      label: it.label ?? `${it.format ?? "h264"} ${it.width ?? ""}x${it.height ?? ""}`.trim(),
      format: it.format ?? "h264",
      quality: it.quality ?? "high",
      gpu: it.gpu ?? true,
      width: it.width,
      height: it.height,
    })) as SocialPreset[];
    const presets = [...fromPresets, ...fromItems];
    if (presets.length === 0) {
      return NextResponse.json({ error: "Indica presetIds o items." }, { status: 400 });
    }

    const document = await getDocument();
    const origin = new URL(req.url).origin;
    const batchId = newId("batch");
    const items: BatchItem[] = presets.map((p) => {
      const jobId = newId("render");
      createJob(jobId);
      return {
        jobId,
        label: p.label,
        format: p.format,
        quality: p.quality,
        gpu: p.gpu,
        width: p.width,
        height: p.height,
        status: "rendering",
        progress: 0,
      };
    });
    createBatch(batchId, items);
    void runBatch(batchId, origin);
    return NextResponse.json({ batchId, jobIds: items.map((i) => i.jobId) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** Procesa el lote EN SERIE con un bundle compartido. Nunca lanza. */
async function runBatch(batchId: string, origin: string): Promise<void> {
  const batch = getBatch(batchId);
  if (!batch) return;
  let serveUrl: string | undefined;
  try {
    const document = await getDocument();
    await ensureBrowser();
    serveUrl = await bundleRemotion();
    const watermark = await shouldWatermark(); // una vez para todo el lote
    setBatchStatus(batchId, "running");
    for (let i = 0; i < batch.items.length; i++) {
      const item = batch.items[i];
      setBatchStatus(batchId, "running", i);
      await runRender(item.jobId, document, origin, {
        format: item.format, quality: item.quality as "high" | "balanced" | "fast", gpu: item.gpu,
        width: item.width, height: item.height,
      }, { serveUrl, watermark, onProgress: (p) => updateBatchItem(batchId, item.jobId, { progress: p }) });
      const job = getJob(item.jobId);
      updateBatchItem(batchId, item.jobId, {
        status: job?.status ?? "error",
        progress: job?.status === "done" ? 1 : job?.progress ?? 0,
        url: job?.url,
        error: job?.error,
      });
    }
  } catch (err) {
    for (const item of batch.items) {
      if (item.status !== "done" && item.status !== "error")
        updateBatchItem(batchId, item.jobId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    if (serveUrl) await fs.rm(serveUrl, { recursive: true, force: true }).catch(() => {});
  }
}
