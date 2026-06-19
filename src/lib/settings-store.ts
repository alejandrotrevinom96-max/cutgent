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
  /** Llaves de API arbitrarias del dueño (BYO): GEMINI_API_KEY, HIGGSFIELD_API_KEY,
   *  OPENAI_API_KEY, REPLICATE_API_TOKEN, FAL_KEY, ELEVENLABS_API_KEY, etc. Se
   *  inyectan en process.env para que CUALQUIER integración (actual o futura) y
   *  las herramientas del MCP las puedan usar. El editor queda "abierto". */
  keys?: Record<string, string>;
  /** Token de licencia CRUDO (CUTGENT-...). Se verifica offline en cada arranque
   *  (src/lib/license.ts). NO es una env var BYO: nunca se inyecta en process.env. */
  license?: string;
}

const FILE = dataDir("settings.json");
let cache: Settings | null = null;

/** Nombres de entorno sensibles que NUNCA se dejan sobrescribir por una llave BYO. */
const ENV_DENYLIST = new Set([
  "PATH", "NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES",
  "ELECTRON_RUN_AS_NODE", "HOME", "USERPROFILE", "TEMP", "TMP",
]);

/** ¿Un nombre de llave está reservado? (denylist exacta o cualquier var de control CUTGENT_*). */
export function isReservedEnvName(name: string): boolean {
  const n = name.toUpperCase();
  return ENV_DENYLIST.has(n) || n.startsWith("CUTGENT_");
}

/** Inyecta las llaves BYO en process.env (autoritativas: lo que el dueño puso en la app gana). */
function applyKeysToEnv(s: Settings): void {
  if (!s.keys) return;
  for (const [name, value] of Object.entries(s.keys)) {
    if (value && !isReservedEnvName(name)) process.env[name] = value;
  }
}

export async function getSettings(): Promise<Settings> {
  if (cache) return cache;
  let raw: string;
  try {
    raw = await fs.readFile(FILE, "utf8");
  } catch (e: unknown) {
    // ENOENT = no hay ajustes aún (legítimo). Cualquier OTRO error de I/O NO se
    // degrada a {}: si lo hiciéramos, el siguiente saveSettings persistiría {} y
    // borraría la licencia pagada + las API keys del dueño.
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      cache = {};
      return cache;
    }
    throw e;
  }
  try {
    cache = JSON.parse(raw) as Settings;
  } catch {
    // Archivo corrupto: respáldalo y NIÉGATE a operar sobre {} (no pisar datos).
    await fs.rename(FILE, `${FILE}.corrupt-${Date.now()}`).catch(() => {});
    throw new Error("settings.json corrupto: respaldado, requiere intervención");
  }
  applyKeysToEnv(cache);
  return cache;
}

/** Cola de escrituras: serializa los saveSettings para que dos POST concurrentes
 *  (p.ej. activar licencia + guardar key) no se pisen con un read-modify-write. */
let writeChain: Promise<unknown> = Promise.resolve();

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const run = writeChain.then(async () => {
    const cur = await getSettings(); // re-lee bajo el lock
    // Strings vacíos = borrar la key.
    const next: Settings = { ...cur };
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || v == null) delete (next as Record<string, unknown>)[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    await fs.mkdir(dataDir(), { recursive: true });
    // Escritura atómica: tmp + rename (mismo volumen) para no truncar el archivo.
    const tmp = `${FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(tmp, FILE);
    cache = next;
    applyKeysToEnv(next);
    return next;
  });
  // La cola sobrevive a un fallo individual; el error real se propaga al llamador.
  writeChain = run.catch(() => {});
  return run as Promise<Settings>;
}

export async function getPexelsKey(): Promise<string> {
  return (await getSettings()).pexelsKey || process.env.PEXELS_API_KEY || "";
}
export async function getPixabayKey(): Promise<string> {
  return (await getSettings()).pixabayKey || process.env.PIXABAY_API_KEY || "";
}

/** Valor de una llave BYO por nombre (settings primero, luego env). */
export async function getKey(name: string): Promise<string> {
  return (await getSettings()).keys?.[name] || process.env[name] || "";
}
/** Nombres de las llaves BYO configuradas (sin valores). */
export async function listKeyNames(): Promise<string[]> {
  return Object.keys((await getSettings()).keys ?? {});
}

/** Token de licencia crudo guardado (o "" si no hay). */
export async function getLicense(): Promise<string> {
  return (await getSettings()).license || "";
}
/** Guarda (o borra con "") el token de licencia crudo. */
export async function setLicense(token: string): Promise<Settings> {
  return saveSettings({ license: token });
}
