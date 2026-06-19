import { NextRequest, NextResponse } from "next/server";
import { restoreSnapshot, getVersion } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/versions/restore { id } → restaura el proyecto a ese snapshot.
 *  Toma un auto de seguridad antes; difunde snapshot por SSE (el cliente se
 *  actualiza solo). 400 si el id no existe o el snapshot es incompatible. */
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Falta 'id'." }, { status: 400 });
    }
    const document = await restoreSnapshot(id, req.headers.get("x-client-id"));
    return NextResponse.json({ ok: true, document, version: getVersion() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
