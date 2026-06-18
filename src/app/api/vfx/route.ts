import { NextRequest, NextResponse } from "next/server";
import { processVfx, type VfxOp } from "@/lib/vfx";
import { addAsset } from "@/lib/asset-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const NAMES: Record<VfxOp, string> = {
  stabilize: "Estabilizado",
  lut: "LUT",
  denoise: "Sin ruido",
  sharpen: "Enfocado",
};

// POST /api/vfx { src, op: stabilize|lut|denoise|sharpen, params?, name? } → asset
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.src || !body.op) {
      return NextResponse.json({ error: "Faltan 'src' y/o 'op'." }, { status: 400 });
    }
    const result = await processVfx(body.src, body.op as VfxOp, body.params ?? {});
    const asset = await addAsset({
      id: result.id,
      name: body.name ?? NAMES[body.op as VfxOp] ?? "VFX",
      kind: "video",
      src: result.src,
    });
    return NextResponse.json(asset);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
