import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { AssetSchema, type Asset } from "@/lib/schema";
import { dataDir, publicDir } from "@/lib/paths";

/**
 * The authoritative registry of media assets (uploaded, imported, or
 * AI-generated) lives here, in the Next.js server process. Both the browser
 * editor and the MCP server read/write it through the HTTP API. The list is
 * persisted to disk so it survives restarts.
 *
 * A globalThis singleton survives Next.js hot-reloads in dev.
 */

const DATA_DIR = dataDir();
const DATA_FILE = dataDir("assets.json");

interface AssetHub {
  assets: Asset[];
  loaded: boolean;
}

const g = globalThis as unknown as { __claudit_assets?: AssetHub };

function hub(): AssetHub {
  if (!g.__claudit_assets) {
    g.__claudit_assets = { assets: [], loaded: false };
  }
  return g.__claudit_assets;
}

async function ensureLoaded(): Promise<void> {
  const h = hub();
  if (h.loaded) return;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    h.assets = AssetSchema.array().parse(parsed);
  } catch {
    // No saved registry yet — start empty and write it.
    await persist(h.assets);
  }
  h.loaded = true;
}

async function persist(assets: Asset[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(assets, null, 2), "utf8");
}

/** All known assets, newest registered last. */
export async function listAssets(): Promise<Asset[]> {
  await ensureLoaded();
  return hub().assets;
}

/** Validate, register (dedup by id) and persist an asset. Returns it. */
export async function addAsset(asset: Asset): Promise<Asset> {
  await ensureLoaded();
  const valid = AssetSchema.parse(asset);
  const h = hub();
  const existing = h.assets.findIndex((a) => a.id === valid.id);
  if (existing !== -1) {
    h.assets[existing] = valid;
  } else {
    h.assets.push(valid);
  }
  await persist(h.assets);
  return valid;
}

/**
 * Genera un proxy 540p en SEGUNDO PLANO y lo asocia al asset (preview fluido;
 * el render sigue usando el original). Salta .webm (perdería el alfa del chroma)
 * y los que ya tienen proxy. Fire-and-forget: el cliente lo verá al refrescar.
 */
export function ensureVideoProxy(asset: Asset): void {
  if (asset.kind !== "video" || asset.proxySrc || asset.src.endsWith(".webm")) return;
  void (async () => {
    try {
      const { makeProxy } = await import("./vfx");
      const { src } = await makeProxy(asset.src);
      await addAsset({ ...asset, proxySrc: src });
    } catch (err) {
      console.error("[proxy] no se pudo generar:", err);
    }
  })();
}

/** Remove an asset from the registry by id and persist. */
export async function removeAsset(id: string): Promise<void> {
  await ensureLoaded();
  const h = hub();
  const asset = h.assets.find((a) => a.id === id);
  h.assets = h.assets.filter((a) => a.id !== id);
  await persist(h.assets);
  // GC: borra del disco el archivo (y su proxy) si vive bajo public/assets, para
  // que el disco no crezca sin límite al eliminar de la biblioteca.
  const base = publicDir();
  for (const src of [asset?.src, asset?.proxySrc]) {
    if (!src || !src.startsWith("/")) continue;
    const file = path.normalize(path.join(base, src.replace(/^\/+/, "")));
    if (file.startsWith(path.join(base, "assets"))) {
      await fs.rm(file, { force: true }).catch(() => {});
    }
  }
}
