import { NextRequest, NextResponse } from "next/server";
import {
  getCachedTranscript,
  getTranscribeJob,
  startTranscribeJob,
  detectLanguage,
} from "@/lib/transcribe";
import { newId } from "@/lib/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * POST /api/transcribe  { src, language? }
 * Si ya hay transcript cacheado lo devuelve; si no, lanza un job en segundo
 * plano (la transcripción de un video largo tarda) y devuelve { jobId }.
 */
export async function POST(req: NextRequest) {
  try {
    const { src, language } = await req.json();
    if (!src) return NextResponse.json({ error: "Falta 'src'." }, { status: 400 });

    // Autodetección de idioma: si no se especifica, detectamos. Si el modelo
    // no está seguro, NO adivinamos: devolvemos 'needs_language' con los
    // candidatos para que el llamador pregunte.
    let lang: string | undefined = language;
    let detection;
    if (!lang) {
      detection = await detectLanguage(src);
      if (detection.confident) lang = detection.language;
      else return NextResponse.json({ status: "needs_language", detection });
    }

    const cached = await getCachedTranscript(src, lang);
    if (cached) return NextResponse.json({ status: "done", transcript: cached, language: lang, detection });

    const jobId = newId("tr");
    startTranscribeJob(jobId, src, lang);
    return NextResponse.json({ status: "running", jobId, language: lang, detection });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * GET /api/transcribe?id=<jobId>  → estado del job (+ transcript si terminó)
 * GET /api/transcribe?src=<src>   → transcript cacheado (o 404)
 */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const src = params.get("src");

  // Solo detectar idioma (sin transcribir).
  if (params.get("detect") && src) {
    return NextResponse.json(await detectLanguage(src));
  }

  if (id) {
    const job = getTranscribeJob(id);
    if (!job) return NextResponse.json({ status: "error", error: "job no encontrado" }, { status: 404 });
    const transcript = job.status === "done" ? await getCachedTranscript(job.src, job.language) : null;
    return NextResponse.json({ status: job.status, error: job.error, transcript });
  }

  if (src) {
    // Sin 'lang' explícito, detectamos el idioma para acertar la clave de caché
    // (los transcripts se guardan por src+idioma).
    let lang = params.get("lang");
    if (!lang) {
      try {
        lang = (await detectLanguage(src)).language;
      } catch {
        lang = "default";
      }
    }
    const transcript =
      (await getCachedTranscript(src, lang)) ?? (await getCachedTranscript(src, "default"));
    if (!transcript) return NextResponse.json({ error: "sin transcript" }, { status: 404 });
    return NextResponse.json({ transcript });
  }

  return NextResponse.json({ error: "Indica id o src" }, { status: 400 });
}
