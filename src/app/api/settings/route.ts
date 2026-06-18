import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, type Settings } from "@/lib/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mask = (k?: string) => (k ? `•••• ${k.slice(-4)}` : "");

// GET /api/settings → estado (las keys NUNCA se devuelven en claro, solo masked).
export async function GET() {
  const s = await getSettings();
  return NextResponse.json({
    pexels: { set: !!s.pexelsKey, masked: mask(s.pexelsKey) },
    pixabay: { set: !!s.pixabayKey, masked: mask(s.pixabayKey) },
    whisperModel: s.whisperModel ?? "",
  });
}

// POST /api/settings { pexelsKey?, pixabayKey?, whisperModel? } → guarda.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const patch: Partial<Settings> = {};
    if (typeof body.pexelsKey === "string") patch.pexelsKey = body.pexelsKey.trim();
    if (typeof body.pixabayKey === "string") patch.pixabayKey = body.pixabayKey.trim();
    if (typeof body.whisperModel === "string") patch.whisperModel = body.whisperModel.trim();
    await saveSettings(patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
