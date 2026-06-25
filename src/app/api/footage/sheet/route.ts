import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import { resolveMediaInput } from "@/lib/media-source";
import { footageContactSheet } from "@/lib/filmstrip";
import { rendersDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // videos largos: fps decodifica todo el archivo

/** POST /api/footage/sheet { src, count?, columns?, width?, format? } → { url, cols, rows, count, durationSec } */
export async function POST(req: NextRequest) {
  try {
    const { src, count, columns, width, format } = await req.json();
    if (!src) return NextResponse.json({ error: "Falta 'src'." }, { status: 400 });

    const dir = rendersDir();
    await fs.mkdir(dir, { recursive: true });
    const ext = format === "png" ? "png" : "jpg";
    const name = `contact_${nanoid(8)}.${ext}`;
    const output = path.join(dir, name);

    const { file, cleanup } = await resolveMediaInput(src, dir);
    try {
      const r = await footageContactSheet({ file, output, count, columns, width });
      return NextResponse.json({ url: `/renders/${name}`, ...r });
    } finally {
      if (cleanup) await cleanup(); // borra el tmp si src vino de URL
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
