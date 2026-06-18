import { NextRequest, NextResponse } from "next/server";
import { normalizeAudio } from "@/lib/normalize";
import { addAsset } from "@/lib/asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/normalize { src, name?, i?, tp?, lra? } → asset normalizado
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.src) return NextResponse.json({ error: "Falta 'src'." }, { status: 400 });
    const result = await normalizeAudio(body.src, { i: body.i, tp: body.tp, lra: body.lra });
    const asset = await addAsset({
      id: result.id,
      name: body.name ?? "Audio normalizado",
      kind: "audio",
      src: result.src,
    });
    return NextResponse.json(asset);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
