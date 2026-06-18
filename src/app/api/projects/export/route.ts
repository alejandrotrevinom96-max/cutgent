import { NextResponse } from "next/server";
import { getDocument } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/projects/export — descarga el proyecto ACTUAL como JSON (.cutgent.json).
 * Es el respaldo de las decisiones de edición (lo irremplazable). Los medios
 * viven en la biblioteca de assets. Restaurar = "Importar proyecto".
 */
export async function GET() {
  const doc = await getDocument();
  const name = (doc.name || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "proyecto";
  return new NextResponse(JSON.stringify(doc, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${name}.cutgent.json"`,
    },
  });
}
