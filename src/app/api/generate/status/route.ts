import { NextRequest, NextResponse } from "next/server";
import { getGenJob } from "@/lib/generation-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/generate/status?id=<jobId> → { status, progress, asset?, error? }
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta 'id'." }, { status: 400 });
  const job = getGenJob(id);
  if (!job) return NextResponse.json({ error: "Trabajo no encontrado (pudo expirar)." }, { status: 404 });
  const elapsedSec = job.startedAt ? (Date.now() - job.startedAt) / 1000 : 0;
  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    kind: job.kind,
    provider: job.provider,
    model: job.model,
    elapsedSec: Math.round(elapsedSec),
    ...(job.asset ? { asset: job.asset } : {}),
    ...(job.error ? { error: job.error } : {}),
  });
}
