import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";

/**
 * Resolución SEGURA de un `src` de media para los procesadores ffmpeg
 * (chroma/normalize/vfx/waveform/transcribe). Cierra el agujero de la auditoría:
 *  - rutas locales SOLO bajo public/ (sin path traversal),
 *  - URLs http(s) SOLO a hosts públicos (sin SSRF a localhost/red interna),
 *  - sin el fallback "ruta arbitraria del disco".
 */

import { publicDir } from "./paths";
const PUBLIC_DIR = path.resolve(publicDir());

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) return true; // IPv6 link/unique-local
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

export interface ResolvedInput {
  file: string;
  cleanup?: () => Promise<void>;
}

export async function resolveMediaInput(src: string, tmpDir: string): Promise<ResolvedInput> {
  if (typeof src !== "string" || !src) throw new Error("src inválido.");

  if (src.startsWith("http://") || src.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(src);
    } catch {
      throw new Error("URL inválida.");
    }
    if (isPrivateHost(url.hostname)) throw new Error("URL no permitida (host privado/interno).");
    const res = await fetch(src);
    if (!res.ok) throw new Error(`No se pudo descargar ${src} (${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, `_tmp_${nanoid(6)}`);
    await fs.writeFile(tmp, buf);
    return { file: tmp, cleanup: () => fs.unlink(tmp).catch(() => {}) };
  }

  if (src.startsWith("/")) {
    const rel = src.replace(/^\/+/, "");
    const abs = path.resolve(PUBLIC_DIR, rel);
    if (abs !== PUBLIC_DIR && !abs.startsWith(PUBLIC_DIR + path.sep)) {
      throw new Error("Ruta fuera de public/ no permitida.");
    }
    return { file: abs };
  }

  throw new Error("src debe ser una ruta servible (/assets, /renders…) o una URL http(s).");
}
