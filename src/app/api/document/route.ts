import { NextRequest, NextResponse } from "next/server";
import { getDocument, getVersion, setDocument } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/document — current document (incluye la versión en una cabecera)
export async function GET() {
  const doc = await getDocument();
  return NextResponse.json(doc, { headers: { "x-doc-version": String(getVersion()) } });
}

// PUT /api/document — replace the whole document
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const origin = req.headers.get("x-client-id");
    const doc = await setDocument(body.document ?? body, origin);
    return NextResponse.json(doc, { headers: { "x-doc-version": String(getVersion()) } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Documento inválido" },
      { status: 400 },
    );
  }
}
