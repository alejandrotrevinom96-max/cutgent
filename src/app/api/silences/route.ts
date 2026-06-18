import { NextRequest, NextResponse } from "next/server";
import { detectSilences } from "@/lib/silences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/silences { src, noiseDb?, minDurSec? } → { silences:[{start,end}] } (segundos). */
export async function POST(req: NextRequest) {
  try {
    const { src, noiseDb, minDurSec } = await req.json();
    if (!src) return NextResponse.json({ error: "Falta 'src'." }, { status: 400 });
    const result = await detectSilences(src, { noiseDb, minDurSec });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
