import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "@/lib/server-store";
import { CommandSchema } from "@/lib/commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/document/command
 * Body: { command: Command } | { commands: Command[] }
 * Header: x-client-id (so the originating client can ignore its own echo)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const origin = req.headers.get("x-client-id");
    const commands = Array.isArray(body.commands)
      ? body.commands
      : body.command
        ? [body.command]
        : [];

    if (commands.length === 0) {
      return NextResponse.json({ error: "Falta 'command' o 'commands'" }, { status: 400 });
    }

    // Valida TODO el lote antes de aplicar nada (evita desync por fallo a media
    // tanda: o se aplican todos o ninguno).
    for (const command of commands) CommandSchema.parse(command);

    let doc;
    for (const command of commands) {
      doc = await dispatch(command, origin);
    }
    return NextResponse.json({ ok: true, document: doc });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Comando inválido" },
      { status: 400 },
    );
  }
}
