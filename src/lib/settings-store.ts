import "server-only";
import { promises as fs } from "fs";
import { dataDir } from "./paths";

/**
 * Ajustes del DUEÑO (bring-your-own): API keys de stock, modelo de Whisper, etc.
 * Se guardan en <userData>/data/settings.json (no en el código), así el cliente
 * mete SUS credenciales desde la app. Fallback a process.env para desarrollo.
 */

export interface Settings {
  pexelsKey?: string;
  pixabayKey?: string;
  whisperModel?: string;
}

const FILE = dataDir("settings.json");
let cache: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, "utf8")) as Settings;
  } catch {
    cache = {};
  }
  return cache;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  // Strings vacíos = borrar la key.
  const next: Settings = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v === "" || v == null) delete (next as Record<string, unknown>)[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  cache = next;
  return next;
}

export async function getPexelsKey(): Promise<string> {
  return (await getSettings()).pexelsKey || process.env.PEXELS_API_KEY || "";
}
export async function getPixabayKey(): Promise<string> {
  return (await getSettings()).pixabayKey || process.env.PIXABAY_API_KEY || "";
}
