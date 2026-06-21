import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, isReservedEnvName, type Settings } from "@/lib/settings-store";
import { getLicenseState, verifyLicense } from "@/lib/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mask = (k?: string) => (k ? `•••• ${k.slice(-4)}` : "");

// Nombre de llave tipo variable de entorno (GEMINI_API_KEY, etc.).
const VALID_KEY = /^[A-Za-z][A-Za-z0-9_]{1,63}$/;

// GET /api/settings → estado (las keys NUNCA se devuelven en claro, solo masked).
export async function GET() {
  const s = await getSettings();
  const keys: Record<string, { set: boolean; masked: string }> = {};
  for (const [name, val] of Object.entries(s.keys ?? {})) {
    keys[name] = { set: !!val, masked: mask(val) };
  }
  return NextResponse.json({
    pexels: { set: !!s.pexelsKey, masked: mask(s.pexelsKey) },
    pixabay: { set: !!s.pixabayKey, masked: mask(s.pixabayKey) },
    jamendo: { set: !!s.jamendoKey, masked: mask(s.jamendoKey) },
    freesound: { set: !!s.freesoundKey, masked: mask(s.freesoundKey) },
    whisperModel: s.whisperModel ?? "",
    keys,
    license: await getLicenseState(),
  });
}

// POST /api/settings { pexelsKey?, pixabayKey?, whisperModel?, keys? } → guarda.
// `keys` = mapa NOMBRE→valor de llaves BYO arbitrarias; "" elimina una llave.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const patch: Partial<Settings> = {};
    if (typeof body.pexelsKey === "string") patch.pexelsKey = body.pexelsKey.trim();
    if (typeof body.pixabayKey === "string") patch.pixabayKey = body.pixabayKey.trim();
    if (typeof body.jamendoKey === "string") patch.jamendoKey = body.jamendoKey.trim();
    if (typeof body.freesoundKey === "string") patch.freesoundKey = body.freesoundKey.trim();
    if (typeof body.whisperModel === "string") patch.whisperModel = body.whisperModel.trim();

    // Licencia: "" la borra; un token debe verificar con la public key embebida.
    if (typeof body.license === "string") {
      const token = body.license.trim();
      if (token === "") {
        patch.license = "";
      } else if (verifyLicense(token).valid) {
        patch.license = token;
      } else {
        return NextResponse.json({ error: "Llave de licencia inválida." }, { status: 400 });
      }
    }

    if (body.keys && typeof body.keys === "object" && !Array.isArray(body.keys)) {
      const cur = { ...((await getSettings()).keys ?? {}) };
      for (const [rawName, rawVal] of Object.entries(body.keys as Record<string, unknown>)) {
        const name = String(rawName).trim().toUpperCase();
        if (!VALID_KEY.test(name) || isReservedEnvName(name)) continue; // ignora inválidos/reservados
        const val = typeof rawVal === "string" ? rawVal.trim() : "";
        if (val === "") delete cur[name];
        else cur[name] = val;
      }
      patch.keys = cur;
    }

    await saveSettings(patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
