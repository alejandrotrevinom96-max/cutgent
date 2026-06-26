import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "@/lib/server-store";
import { critiqueProject } from "@/lib/critique";
import { appendFeedback, listFeedback, type OutcomeSource } from "@/lib/feedback-store";
import { computeReport } from "@/lib/feedback-report";
import type { Scorecard } from "@/lib/critique-score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // critiqueProject corre ffmpeg cuando auto-extrae features

/** Scorecard → features map (solo applicable; el overall siempre). */
function scorecard2features(card: Scorecard): Record<string, number> {
  const f: Record<string, number> = { overall: card.overall };
  for (const d of card.dimensions) if (d.applicable) f[d.dimension] = d.score;
  return f;
}

/** POST /api/feedback { outcome, source, label?, note?, features?, targetLufs? } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const outcome = Number(body?.outcome);
    if (!Number.isFinite(outcome)) return NextResponse.json({ error: "outcome (0..100) requerido." }, { status: 400 });
    const source: OutcomeSource = (["predictor", "retention", "manual"] as const).includes(body?.source) ? body.source : "manual";

    const doc = await getDocument();
    if (!doc) return NextResponse.json({ error: "No hay proyecto abierto." }, { status: 400 });

    const features: Record<string, number> =
      body?.features && typeof body.features === "object"
        ? body.features
        : scorecard2features(await critiqueProject(doc, { targetLufs: body?.targetLufs }));

    const entry = await appendFeedback({
      projectId: doc.id,
      features,
      outcome,
      source,
      label: typeof body?.label === "string" ? body.label.slice(0, 80) : undefined,
      note: typeof body?.note === "string" ? body.note : undefined,
    });
    return NextResponse.json({ registered: entry });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** GET /api/feedback?projectId=X → reporte de correlaciones (omite projectId → proyecto actual). */
export async function GET(req: NextRequest) {
  try {
    const qp = req.nextUrl.searchParams.get("projectId");
    const projectId = qp || (await getDocument())?.id;
    const entries = await listFeedback(projectId);
    return NextResponse.json({ projectId, entries: entries.length, report: computeReport(entries) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
