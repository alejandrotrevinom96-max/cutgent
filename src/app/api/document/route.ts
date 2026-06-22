import { NextRequest, NextResponse } from "next/server";
import { getDocument, getHistoryState, getVersion, setDocument } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/document — current document (versión + estado de historial en cabeceras)
export async function GET() {
  const doc = await getDocument();
  const hist = getHistoryState();
  return NextResponse.json(doc, {
    headers: {
      "x-doc-version": String(getVersion()),
      "x-can-undo": String(hist.canUndo),
      "x-can-redo": String(hist.canRedo),
    },
  });
}

// PUT /api/document — replace the whole document
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const origin = req.headers.get("x-client-id");
    const doc = await setDocument(body.document ?? body, origin);
    const hist = getHistoryState();
    return NextResponse.json(doc, {
      headers: {
        "x-doc-version": String(getVersion()),
        "x-can-undo": String(hist.canUndo),
        "x-can-redo": String(hist.canRedo),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Documento inválido" },
      { status: 400 },
    );
  }
}
