import { NextRequest, NextResponse } from "next/server";
import { getHistoryState, getVersion, redo } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/document/redo — rehace el cambio deshecho
export async function POST(req: NextRequest) {
  const origin = req.headers.get("x-client-id");
  const document = await redo(origin);
  return NextResponse.json({ ok: true, document, version: getVersion(), ...getHistoryState() });
}
