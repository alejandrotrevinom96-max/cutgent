import "server-only";
import path from "path";
import { pathToFileURL } from "url";
import { bundle } from "@remotion/bundler";
import { publicDir } from "./paths";
import type { Project } from "./schema";

/**
 * Utilidades compartidas por las rutas que usan Remotion en el servidor
 * (render de video y export de poster/miniatura): bundling de la composición y
 * absolutización de assets locales.
 */

/** Convierte src locales (/assets, /renders) en URL absolutas servibles. */
export function absolutizeAssets(document: Project, origin: string): Project {
  return {
    ...document,
    tracks: document.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        "src" in c && typeof c.src === "string" && c.src.startsWith("/")
          ? { ...c, src: origin + c.src }
          : c,
      ),
    })),
  };
}

/**
 * Reescribe los src locales (/assets/...) a URIs file:// ABSOLUTAS en disco,
 * para el export de XML de NLE (un editor externo no resuelve rutas HTTP). Los
 * http(s) se dejan tal cual. /assets/x.mp4 → file:///<CUTGENT_DATA_DIR>/public/assets/x.mp4
 */
export function absolutizeAssetsToFile(document: Project): Project {
  return {
    ...document,
    tracks: document.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        "src" in c && typeof c.src === "string" && c.src.startsWith("/")
          ? { ...c, src: pathToFileURL(path.join(publicDir(), c.src.replace(/^\/+/, ""))).href }
          : c,
      ),
    })),
  };
}

/**
 * Empaqueta src/remotion para que el renderer headless lo sirva. El bundler de
 * Remotion no conoce el alias '@' del proyecto y los archivos de src/remotion
 * importan de '@/lib/...': es OBLIGATORIO registrarlo en webpackOverride o el
 * bundle falla. El llamador DEBE limpiar el directorio devuelto al terminar.
 */
export function bundleRemotion(): Promise<string> {
  return bundle({
    entryPoint: path.join(process.cwd(), "src", "remotion", "index.ts"),
    webpackOverride: (config) => {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "@": path.join(process.cwd(), "src"),
      };
      return config;
    },
  });
}
