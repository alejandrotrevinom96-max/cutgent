import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { newId } from "@/lib/factory";
import { type Asset } from "@/lib/schema";
import { addAsset, ensureVideoProxy } from "@/lib/asset-store";
import { assetsDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSETS_DIR = assetsDir();

type AssetKind = Asset["kind"];

/** Map a MIME type to an asset kind, or null if unsupported. */
function kindFromMime(mime: string): AssetKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

/** Best-effort fallback extension when the file name has none. */
function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "weba",
    "audio/aac": "aac",
  };
  return map[mime] ?? "bin";
}

/** POST /api/assets/upload — multipart with field 'file'. Returns the Asset. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Falta el archivo 'file'" }, { status: 400 });
    }

    const kind = kindFromMime(file.type);
    if (!kind) {
      return NextResponse.json(
        { error: `Tipo de archivo no soportado: ${file.type || "desconocido"}` },
        { status: 400 },
      );
    }

    const id = newId("asset");
    const nameExt = path.extname(file.name).replace(/^\./, "").toLowerCase();
    const ext = nameExt || extFromMime(file.type);
    const fileName = `${id}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    await fs.writeFile(path.join(ASSETS_DIR, fileName), buf);

    const asset: Asset = {
      id,
      name: file.name,
      kind,
      src: `/assets/${fileName}`,
    };
    const saved = await addAsset(asset);
    ensureVideoProxy(saved);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo subir el archivo" },
      { status: 400 },
    );
  }
}
