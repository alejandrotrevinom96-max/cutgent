import { NextResponse } from "next/server";
import { listProviderInfo } from "@/lib/generation";
import { getKey } from "@/lib/settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/generate/providers → [{id,label,requiredKey,hasKey,models}] (NUNCA expone valores de keys). */
export async function GET() {
  const info = listProviderInfo();
  const out = await Promise.all(
    info.map(async (p) => ({ ...p, hasKey: !!(await getKey(p.requiredKey)) })),
  );
  return NextResponse.json(out);
}
