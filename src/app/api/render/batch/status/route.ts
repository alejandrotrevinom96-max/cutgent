import { NextRequest, NextResponse } from "next/server";
import { getBatch } from "@/lib/render-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/render/batch/status?id=<batchId> → estado del lote + items. */
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  const batch = getBatch(id);
  if (!batch) return NextResponse.json({ error: "Lote no encontrado." }, { status: 404 });
  const done = batch.items.filter((i) => i.status === "done").length;
  return NextResponse.json({
    id: batch.id,
    status: batch.status,
    currentIndex: batch.currentIndex,
    total: batch.items.length,
    done,
    items: batch.items.map((i) => ({
      jobId: i.jobId, label: i.label, status: i.status, progress: i.progress, url: i.url, error: i.error,
    })),
  });
}
