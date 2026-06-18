import { NextRequest, NextResponse } from "next/server";
import { searchStock, type StockKind, type StockProvider } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseKind(raw: string | null): StockKind {
  return raw === "image" ? "image" : "video";
}

function parseProvider(raw: string | null): StockProvider | "all" {
  if (raw === "pexels" || raw === "pixabay") return raw;
  return "all";
}

/**
 * GET /api/stock/search?q=&type=image|video&provider=pexels|pixabay|all
 * → { results: StockResult[]; warnings: string[] }
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const q = params.get("q");
    if (!q || q.trim().length === 0) {
      return NextResponse.json({ error: "Falta el parámetro 'q'" }, { status: 400 });
    }

    const type = parseKind(params.get("type"));
    const provider = parseProvider(params.get("provider"));

    const { results, warnings } = await searchStock(q.trim(), type, provider);
    return NextResponse.json({ results, warnings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo buscar stock" },
      { status: 400 },
    );
  }
}
