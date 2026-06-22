import { NextRequest, NextResponse } from "next/server";
import { getHistoryState, getVersion, openProject } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/projects/open — Body: { id }
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const document = await openProject(id, req.headers.get("x-client-id"));
    return NextResponse.json({ ok: true, document, version: getVersion(), ...getHistoryState() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
