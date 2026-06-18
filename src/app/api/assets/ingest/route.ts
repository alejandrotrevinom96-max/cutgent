import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { addAsset, ensureVideoProxy } from "@/lib/asset-store";
import { newId } from "@/lib/factory";
import { assetsDir as assetsDirPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/assets/ingest  { path, name? }
 * Copia un archivo del disco del DUEÑO (herramienta local, own-it-not-rent-it)
 * a public/assets para que el editor pueda usarlo/servirlo. kind por extensión.
 */
const KIND_BY_EXT: Record<string, "video" | "image" | "audio"> = {
  ".mp4": "video", ".mov": "video", ".webm": "video", ".mkv": "video", ".avi": "video",
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image",
  ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".aac": "audio", ".ogg": "audio",
};

export async function POST(req: NextRequest) {
  try {
    const { path: filePath, name } = await req.json();
    if (!filePath) return NextResponse.json({ error: "Falta 'path'." }, { status: 400 });

    const ext = path.extname(filePath).toLowerCase();
    const kind = KIND_BY_EXT[ext];
    if (!kind) return NextResponse.json({ error: `Extensión no soportada: ${ext}` }, { status: 400 });

    const buf = await fs.readFile(filePath);
    const id = newId("asset");
    const assetsDir = assetsDirPath();
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.writeFile(path.join(assetsDir, `${id}${ext}`), buf);

    const asset = await addAsset({
      id,
      name: name ?? path.basename(filePath),
      kind,
      src: `/assets/${id}${ext}`,
    });
    ensureVideoProxy(asset);
    return NextResponse.json(asset);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
