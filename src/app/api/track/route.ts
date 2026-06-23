import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { newId } from "@/lib/factory";
import { getKey } from "@/lib/settings-store";
import { getDocument } from "@/lib/server-store";
import { findClip } from "@/lib/commands";
import { getTrackProvider } from "@/lib/tracking";
import { createVfxJob } from "@/lib/vfx-jobs";
import { runTracking, selectedProviderId } from "@/lib/tracking/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // > deadline de poll

const Body = z.object({ clipId: z.string(), model: z.string().optional() });

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Parámetros inválidos.", detail: parsed.error.issues }, { status: 400 });
    }
    const { clipId, model: modelArg } = parsed.data;
    const providerId = selectedProviderId();
    const provider = getTrackProvider(providerId);
    if (!provider) return NextResponse.json({ error: `Proveedor de tracking desconocido: ${providerId}` }, { status: 400 });

    let key = "";
    if (provider.requiredKey) {
      key = await getKey(provider.requiredKey);
      if (!key) {
        return NextResponse.json(
          { error: `Falta la API key ${provider.requiredKey}. Configúrala en Ajustes.`, missingKey: provider.requiredKey },
          { status: 400 },
        );
      }
    }

    // Validar que el clip exista ANTES de lanzar el job.
    const found = findClip(await getDocument(), clipId);
    if (!found) return NextResponse.json({ error: `Clip ${clipId} no encontrado.` }, { status: 400 });

    const model = modelArg || process.env.CUTGENT_SAM2_MODEL || "meta/sam-2-video:PINME";
    const jobId = newId("track");
    createVfxJob(jobId, { clipId, provider: providerId, model });
    void runTracking(jobId, providerId, clipId, key, model);
    return NextResponse.json({ jobId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
