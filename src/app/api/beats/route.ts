import { NextRequest, NextResponse } from "next/server";
import { analyzeBeats } from "@/lib/beats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/beats { src, fps? } → { bpm, confidence, durationSec, beats[], onsets[], energy[] } */
export async function POST(req: NextRequest) {
  try {
    const { src, fps } = await req.json();
    if (!src) return NextResponse.json({ error: "Falta 'src'." }, { status: 400 });
    return NextResponse.json(await analyzeBeats(src, { fps }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
