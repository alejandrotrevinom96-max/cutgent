import { NextRequest, NextResponse } from "next/server";
import { transcribeAudioBuffer } from "@/lib/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Tamaño máximo de un clip de dictado (10 MB ≈ varios minutos de opus). */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/dictate  (multipart: audio=<blob>, language?=<code>)
 * Transcribe un clip corto del micrófono con el Whisper LOCAL y devuelve texto.
 * Es la capa de entrada por voz de las notas: voz → texto, nunca control directo.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Falta el audio." }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) {
      return NextResponse.json({ error: "Audio demasiado grande." }, { status: 413 });
    }
    const language = (form.get("language") as string | null) || undefined;
    const ext = (audio.type.split("/")[1] || "webm").split(";")[0];
    const buf = Buffer.from(await audio.arrayBuffer());

    const text = await transcribeAudioBuffer(buf, { language, ext });
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
