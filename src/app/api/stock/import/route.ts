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

interface ImportBody {
  url?: unknown;
  kind?: unknown;
  name?: unknown;
  width?: unknown;
  height?: unknown;
  durationSec?: unknown;
}

function isAssetKind(value: unknown): value is AssetKind {
  return value === "image" || value === "video" || value === "audio";
}

/** Fallback extension derived from the asset kind. */
function extFromKind(kind: AssetKind): string {
  switch (kind) {
    case "image":
      return "jpg";
    case "video":
      return "mp4";
    case "audio":
      return "mp3";
    default:
      return "bin";
  }
}

/** Try to derive a clean file extension from the URL path. */
function extFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).replace(/^\./, "").toLowerCase();
    if (ext && /^[a-z0-9]{1,5}$/.test(ext)) return ext;
    return null;
  } catch {
    return null;
  }
}

/**
 * POST /api/stock/import — body { url, kind, name, width?, height? }.
 * Downloads the bytes, writes them under public/assets, registers the Asset
 * and returns it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ImportBody;

    const url = typeof body.url === "string" ? body.url : "";
    if (!url) {
      return NextResponse.json({ error: "Falta el parámetro 'url'" }, { status: 400 });
    }

    if (!isAssetKind(body.kind)) {
      return NextResponse.json(
        { error: "Parámetro 'kind' inválido (image | video | audio)" },
        { status: 400 },
      );
    }
    const kind: AssetKind = body.kind;

    const name =
      typeof body.name === "string" && body.name.trim().length > 0
        ? body.name.trim()
        : `Stock ${kind}`;

    const width = typeof body.width === "number" ? body.width : undefined;
    const height = typeof body.height === "number" ? body.height : undefined;
    // Guarda la duración (a 30fps de referencia) para que el clip no entre a 3s.
    const durationInFrames =
      typeof body.durationSec === "number" && body.durationSec > 0
        ? Math.max(1, Math.round(body.durationSec * 30))
        : undefined;

    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        { error: `No se pudo descargar el recurso (HTTP ${res.status})` },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());

    const id = newId("asset");
    const ext = extFromUrl(url) ?? extFromKind(kind);
    const fileName = `${id}.${ext}`;

    await fs.mkdir(ASSETS_DIR, { recursive: true });
    await fs.writeFile(path.join(ASSETS_DIR, fileName), buf);

    const asset: Asset = {
      id,
      name,
      kind,
      src: `/assets/${fileName}`,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(durationInFrames !== undefined ? { durationInFrames } : {}),
    };

    const saved = await addAsset(asset);
    ensureVideoProxy(saved);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo importar el recurso" },
      { status: 400 },
    );
  }
}
