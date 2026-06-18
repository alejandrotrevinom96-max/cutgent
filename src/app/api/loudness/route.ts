import { NextRequest, NextResponse } from "next/server";
import { measureLoudness } from "@/lib/audio-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/loudness { src } → { integratedLufs, truePeakDb, lra, vsYouTube }. */
export async function POST(req: NextRequest) {
  try {
    const { src } = await req.json();
    if (!src) return NextResponse.json({ error: "Falta 'src'." }, { status: 400 });
    const result = await measureLoudness(src);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
