import "server-only";
import path from "path";

/**
 * Rutas escribibles de la app. En desarrollo apuntan a la raíz del proyecto
 * (process.cwd()). Empaquetada (Electron), `CUTGENT_DATA_DIR` apunta a una
 * carpeta del usuario (app.getPath('userData')), porque los recursos instalados
 * son de SOLO LECTURA. El server de Electron sirve /assets y /renders desde
 * aquí, así que las URLs no cambian.
 */

const BASE = process.env.CUTGENT_DATA_DIR || process.cwd();

/** Raíz de datos (data/...). */
export const dataDir = (...segs: string[]): string => path.join(BASE, "data", ...segs);
/** Raíz "public" escribible (public/...). */
export const publicDir = (...segs: string[]): string => path.join(BASE, "public", ...segs);
/** public/assets (uploads, generados, proxies). */
export const assetsDir = (): string => publicDir("assets");
/** public/renders (exports, posters). */
export const rendersDir = (): string => publicDir("renders");
/** Caché de modelos de Whisper (transformers.js). */
export const modelsDir = (): string => path.join(BASE, "models");
