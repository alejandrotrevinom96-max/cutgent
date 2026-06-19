import { NextRequest, NextResponse } from "next/server";
import { listSnapshots, saveSnapshot } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/versions → { currentId, snapshots } (más reciente primero). */
export async function GET() {
  const data = await listSnapshots();
  return NextResponse.json(data);
}

/** POST /api/versions { label? } → guarda un snapshot MANUAL. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const label = typeof body.label === "string" ? body.label : undefined;
    const snapshot = await saveSnapshot({ kind: "manual", label });
    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
