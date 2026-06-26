import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "@/lib/server-store";
import { critiqueProject } from "@/lib/critique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // ffmpeg por pista de audio puede tardar

/** POST /api/critique { targetLufs? } → Scorecard editorial. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const doc = await getDocument();
    if (!doc) return NextResponse.json({ error: "No hay proyecto abierto." }, { status: 400 });
    const card = await critiqueProject(doc, { targetLufs: body?.targetLufs });
    return NextResponse.json(card);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
