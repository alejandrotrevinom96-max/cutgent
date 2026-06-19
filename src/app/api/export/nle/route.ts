import { NextResponse } from "next/server";
import { getDocument } from "@/lib/server-store";
import { absolutizeAssetsToFile } from "@/lib/remotion-bundle";
import { exportNle, nleFileName, NLE_MIME, type NleFormat } from "@/lib/nle-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/export/nle  { format?: "fcp7" | "fcpxml" }
 * Genera el XML de NLE (FCP7 XMEML por defecto) y lo devuelve como descarga para
 * continuar el proyecto en Premiere / DaVinci Resolve. Síncrono (sin Remotion).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const format: NleFormat = body?.format === "fcpxml" ? "fcpxml" : "fcp7";
    const doc = await getDocument();
    const warnings: string[] = [];
    const xml = exportNle(absolutizeAssetsToFile(doc), format, { warnings });
    const filename = nleFileName(doc, format);
    return new NextResponse(xml, {
      headers: {
        "Content-Type": `${NLE_MIME[format]}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...(warnings.length ? { "X-Cutgent-Warnings": encodeURIComponent(JSON.stringify(warnings)) } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
