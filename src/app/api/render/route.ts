import { NextResponse } from "next/server";
import { getDocument } from "@/lib/server-store";
import { newId } from "@/lib/factory";
import { createJob } from "@/lib/render-jobs";
import { runRender, type RenderOpts } from "@/lib/render-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/render { format?, quality?, gpu?, draft?, width?, height?, frameRange? }
 * Toma el documento autoritativo actual y lanza un render EN SEGUNDO PLANO con
 * Remotion. Responde { jobId }; el progreso se consulta en
 * GET /api/render/status?id=<jobId>. El pipeline vive en @/lib/render-run porque
 * Next 15 solo permite exportar handlers + config desde un archivo de ruta.
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
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
