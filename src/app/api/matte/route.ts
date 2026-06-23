import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { newId } from "@/lib/factory";
import { getKey } from "@/lib/settings-store";
import { getDocument } from "@/lib/server-store";
import { findClip } from "@/lib/commands";
import { getMatteProvider } from "@/lib/matting";
import { createVfxJob } from "@/lib/vfx-jobs";
import { runMatting, selectedMatteProviderId } from "@/lib/matting/run";

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
    const providerId = selectedMatteProviderId();
    const provider = getMatteProvider(providerId);
    if (!provider) return NextResponse.json({ error: `Proveedor de matting desconocido: ${providerId}` }, { status: 400 });

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

    const found = findClip(await getDocument(), clipId);
    if (!found) return NextResponse.json({ error: `Clip ${clipId} no encontrado.` }, { status: 400 });

    const model = modelArg || process.env.CUTGENT_MATTE_MODEL || "veed/video-background-removal";
    const jobId = newId("matte");
    createVfxJob(jobId, { clipId, provider: providerId, model });
    void runMatting(jobId, providerId, clipId, key, model);
    return NextResponse.json({ jobId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
