import { NextRequest, NextResponse } from "next/server";
import { createProject, deleteProject, listProjects } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/projects — lista de proyectos + id actual
export async function GET() {
  return NextResponse.json(await listProjects());
}

// POST /api/projects — crea un proyecto nuevo. Body: { name?, kind?, sourceId?, document? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const meta = await createProject({
      name: body.name,
      kind: body.kind,
      sourceId: body.sourceId,
      document: body.document,
    });
    return NextResponse.json(meta);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

// DELETE /api/projects?id=...
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await deleteProject(id, req.headers.get("x-client-id"));
  return NextResponse.json({ ok: true, ...(await listProjects()) });
}
