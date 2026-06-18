import { NextRequest, NextResponse } from "next/server";
import { AssetSchema } from "@/lib/schema";
import { addAsset, listAssets, removeAsset } from "@/lib/asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/assets → Asset[] */
export async function GET() {
  return NextResponse.json(await listAssets());
}

/** POST /api/assets — body { asset } → registers and returns the asset. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const asset = AssetSchema.parse(body.asset);
    const saved = await addAsset(asset);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Asset inválido" },
      { status: 400 },
    );
  }
}

/** DELETE /api/assets?id=<id> → { ok: true } */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta el parámetro 'id'" }, { status: 400 });
    }
    await removeAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo eliminar el asset" },
      { status: 400 },
    );
  }
}
