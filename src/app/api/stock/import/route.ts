import { NextRequest, NextResponse } from "next/server";
import { type Asset } from "@/lib/schema";
import { downloadToAsset } from "@/lib/generation/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetKind = Asset["kind"];

interface ImportBody {
  url?: unknown;
  kind?: unknown;
  name?: unknown;
  width?: unknown;
  height?: unknown;
  durationSec?: unknown;
}

function isAssetKind(value: unknown): value is AssetKind {
  return value === "image" || value === "video" || value === "audio";
}

/**
 * POST /api/stock/import — body { url, kind, name, width?, height?, durationSec? }.
 * Descarga los bytes (con guard anti-SSRF + tope de tamaño + timeout vía
 * downloadToAsset), los escribe en public/assets, registra el Asset y lo
 * devuelve. Sirve para image | video | audio (música/SFX de stock).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ImportBody;

    const url = typeof body.url === "string" ? body.url : "";
    if (!url) {
      return NextResponse.json({ error: "Falta el parámetro 'url'" }, { status: 400 });
    }

    if (!isAssetKind(body.kind)) {
      return NextResponse.json(
        { error: "Parámetro 'kind' inválido (image | video | audio)" },
        { status: 400 },
      );
    }
    const kind: AssetKind = body.kind;

    const name =
      typeof body.name === "string" && body.name.trim().length > 0
        ? body.name.trim()
        : `Stock ${kind}`;

    const width = typeof body.width === "number" ? body.width : undefined;
    const height = typeof body.height === "number" ? body.height : undefined;
    const durationSec =
      typeof body.durationSec === "number" && body.durationSec > 0
        ? body.durationSec
        : undefined;

    const saved = await downloadToAsset({ url, kind, name, width, height, durationSec });
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo importar el recurso" },
      { status: 400 },
    );
  }
}
