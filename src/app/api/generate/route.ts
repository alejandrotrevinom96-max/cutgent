import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { newId } from "@/lib/factory";
import { getKey } from "@/lib/settings-store";
import { getProvider, PROVIDER_IDS } from "@/lib/generation";
import type { GenRequest, GenStartDone, GenPoll } from "@/lib/generation/types";
import { createGenJob, getGenJob, updateGenJob } from "@/lib/generation-jobs";
import { downloadToAsset } from "@/lib/generation/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  provider: z.enum(["replicate", "fal", "openai"]),
  kind: z.enum(["image", "video", "audio"]),
  prompt: z.string().min(1).max(2000),
  model: z.string().optional(),
  imageUrl: z.string().url().max(2048).optional(),
  width: z.number().int().min(64).max(4096).optional(),
  height: z.number().int().min(64).max(4096).optional(),
  durationSec: z.number().min(0.1).max(60).optional(),
  voiceId: z.string().optional(),
  aspectRatio: z.string().optional(),
});

const nameFromPrompt = (p: string) => p.trim().replace(/\s+/g, " ").slice(0, 48) || "Generado";

/** Corre la generación en segundo plano. NUNCA lanza (refleja el estado en el job). */
async function runGeneration(jobId: string, providerId: string, req: GenRequest, apiKey: string): Promise<void> {
  try {
    const provider = getProvider(providerId)!;
    const start = await provider.start(req, apiKey);
    let done: GenStartDone | GenPoll;
    if (start.state === "done") {
      done = start;
    } else {
      const deadline = Date.now() + (req.kind === "video" ? 300_000 : 120_000);
      let result: GenPoll | undefined;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const pr = await provider.poll!(start.providerJobId, apiKey, req.model!);
        const cur = getGenJob(jobId)?.progress ?? 0;
        updateGenJob(jobId, { progress: Math.max(cur, pr.progress ?? Math.min(0.9, cur + 0.1)) });
        if (pr.state === "done") { result = pr; break; }
        if (pr.state === "error") throw new Error(pr.error || "la generación falló");
      }
      if (!result) throw new Error("la generación superó el tiempo de espera");
      done = result;
    }
    const asset = await downloadToAsset({
      url: done.mediaUrl,
      bytes: done.bytes,
      mimeType: done.mimeType,
      kind: req.kind,
      name: nameFromPrompt(req.prompt),
      width: done.width,
      height: done.height,
      durationSec: done.durationSec ?? req.durationSec,
    });
    updateGenJob(jobId, { status: "done", progress: 1, asset });
  } catch (e) {
    updateGenJob(jobId, { status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Parámetros inválidos.", detail: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;
    const provider = getProvider(body.provider);
    if (!provider) return NextResponse.json({ error: `Proveedor desconocido (usa: ${PROVIDER_IDS.join(", ")}).` }, { status: 400 });
    if (!provider.supports(body.kind)) {
      return NextResponse.json({ error: `${provider.label} no soporta ${body.kind}.` }, { status: 400 });
    }
    const apiKey = await getKey(provider.requiredKey);
    if (!apiKey) {
      return NextResponse.json({ error: `Falta la API key ${provider.requiredKey}. Configúrala en Ajustes.`, missingKey: provider.requiredKey }, { status: 400 });
    }
    const model = body.model || provider.defaultModel(body.kind);
    if (!model) return NextResponse.json({ error: `Sin modelo por defecto para ${body.kind} en ${provider.label}.` }, { status: 400 });

    const genReq: GenRequest = { ...body, model };
    const jobId = newId("gen");
    createGenJob(jobId, { kind: body.kind, provider: body.provider, model, prompt: body.prompt });
    void runGeneration(jobId, body.provider, genReq, apiKey);
    return NextResponse.json({ jobId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
