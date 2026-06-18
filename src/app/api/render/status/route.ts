import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/render-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/render/status?id=<jobId>
 * Devuelve el estado del trabajo de render: { status, progress, url?, error? }.
 * Si no existe (o falta el id), responde 404 con un job en estado 'error'.
 */
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  const job = id ? getJob(id) : undefined;

  if (!job) {
    return NextResponse.json(
      { status: "error", progress: 0, error: "job no encontrado" },
      { status: 404 },
    );
  }

  // Estima el tiempo restante a partir del progreso transcurrido.
  const elapsedSec = job.startedAt ? (Date.now() - job.startedAt) / 1000 : undefined;
  const etaSec =
    job.status === "rendering" && job.progress > 0.02 && elapsedSec
      ? Math.max(0, Math.round(elapsedSec / job.progress - elapsedSec))
      : undefined;

  return NextResponse.json({ ...job, elapsedSec, etaSec });
}
