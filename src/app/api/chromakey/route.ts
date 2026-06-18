import { NextRequest, NextResponse } from "next/server";
import { processChromaKey } from "@/lib/chromakey";
import { addAsset } from "@/lib/asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El procesado con ffmpeg puede tardar; ampliamos el máximo.
export const maxDuration = 300;

/**
 * POST /api/chromakey
 * Body: { src, color?, similarity?, blend?, name? }
 * Genera un WebM con canal alfa (quita la pantalla verde) y lo registra como asset.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.src) {
      return NextResponse.json({ error: "Falta 'src'." }, { status: 400 });
    }
    // Validación de entradas → 400 (no 500) para errores del usuario.
    if (body.color !== undefined && !/^(0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}|[a-zA-Z]{3,20})$/.test(String(body.color))) {
      return NextResponse.json(
        { error: "color inválido: usa #RRGGBB, 0xRRGGBB o un nombre (p. ej. green)." },
        { status: 400 },
      );
    }
    for (const k of ["similarity", "blend"] as const) {
      if (body[k] !== undefined && (typeof body[k] !== "number" || body[k] < 0 || body[k] > 1)) {
        return NextResponse.json({ error: `${k} debe ser un número entre 0 y 1.` }, { status: 400 });
      }
    }
    const result = await processChromaKey(body.src, {
      color: body.color,
      similarity: body.similarity,
      blend: body.blend,
    });
    const asset = await addAsset({
      id: result.id,
      name: body.name ?? "Chroma",
      kind: "video",
      src: result.src,
    });
    return NextResponse.json(asset);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en chroma key" },
      { status: 500 },
    );
  }
}
