import { NextRequest, NextResponse } from "next/server";
import { getHistoryState, getVersion, undo } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/document/undo — deshace el último cambio
export async function POST(req: NextRequest) {
  const origin = req.headers.get("x-client-id");
  const document = await undo(origin);
  return NextResponse.json({ ok: true, document, version: getVersion(), ...getHistoryState() });
}
