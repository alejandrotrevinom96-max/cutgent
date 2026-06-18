import { NextRequest, NextResponse } from "next/server";
import { getWaveform } from "@/lib/waveform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/waveform?src=...&buckets=600 → { peaks: number[] (0..1) }
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const src = params.get("src");
  if (!src) return NextResponse.json({ error: "Falta src" }, { status: 400 });
  const buckets = Math.min(4000, Math.max(1, Math.floor(Number(params.get("buckets")) || 600)));
  try {
    const peaks = await getWaveform(src, buckets);
    return NextResponse.json(
      { peaks },
      { headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), peaks: [] },
      { status: 500 },
    );
  }
}
