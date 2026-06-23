import { NextRequest, NextResponse } from "next/server";
import { getVfxJob } from "@/lib/vfx-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/vfx/status?id=<jobId> → { status, progress, postedProps?, keyframes?, error? }
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta 'id'." }, { status: 400 });
  const job = getVfxJob(id);
  if (!job) return NextResponse.json({ error: "Trabajo no encontrado (pudo expirar)." }, { status: 404 });
  const elapsedSec = job.startedAt ? Math.round((Date.now() - job.startedAt) / 1000) : 0;
  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    clipId: job.clipId,
    provider: job.provider,
    model: job.model,
    elapsedSec,
    ...(job.postedProps ? { postedProps: job.postedProps } : {}),
    ...(job.keyframes ? { keyframes: job.keyframes } : {}),
    ...(job.error ? { error: job.error } : {}),
  });
}
