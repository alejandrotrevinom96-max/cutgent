import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { newId } from "../factory";
import { addAsset, ensureVideoProxy } from "../asset-store";
import { assetsDir } from "../paths";
import type { Asset } from "../schema";
import type { GenKind } from "./types";

/**
 * Descarga SEGURA del resultado del proveedor → asset en public/assets.
 * Copia isPrivateHost (anti-SSRF) de media-source.ts y AÑADE un tope de tamaño
 * y un timeout que hoy no existen en stock/import ni en POST /api/assets. Las
 * CDN de los proveedores (replicate.delivery, fal.media…) NO son el apiHost, así
 * que la descarga se valida por host-privado + tamaño + timeout, no por allowlist.
 */
const MAX_BYTES = 200 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

/** Parsea una parte de IPv4 admitiendo decimal, 0x-hex y 0-octal (inet_aton). */
function parseIntPart(p: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(p)) return parseInt(p, 16);
  if (/^0[0-7]+$/.test(p)) return parseInt(p, 8);
  if (/^[1-9]\d*$/.test(p) || p === "0") return parseInt(p, 10);
  return null;
}

/** Normaliza un host literal IPv4 en cualquiera de sus formas (dotted/decimal/hex/
 *  octal/short) a 4 octetos; null si no es un literal IPv4. */
function toOctets(host: string): number[] | null {
  if (host.includes(".")) {
    const parts = host.split(".");
    if (parts.length < 1 || parts.length > 4) return null;
    const nums = parts.map(parseIntPart);
    if (nums.some((n) => n === null)) return null;
    const ns = nums as number[];
    if (ns.length === 4) return ns.every((n) => n >= 0 && n <= 255) ? ns : null;
    const head = ns.slice(0, -1);
    if (head.some((n) => n > 255)) return null;
    const remaining = 4 - head.length;
    const last = ns[ns.length - 1];
    if (last < 0 || last >= 256 ** remaining) return null;
    const lastBytes: number[] = [];
    let v = last;
    for (let i = remaining - 1; i >= 0; i--) { lastBytes[i] = v & 255; v = Math.floor(v / 256); }
    return [...head, ...lastBytes];
  }
  const n = parseIntPart(host);
  if (n === null || n < 0 || n > 0xffffffff) return null;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function isPrivateOctets(o: number[]): boolean {
  const [a, b] = o;
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** Bloquea hosts privados/internos. Cubre IPv4 en cualquier forma (octal/decimal/
 *  hex/short), IPv6 link/unique-local, ::1 y ::ffff: mapeado. Residual conocido y
 *  aceptado para esta app local single-user: rebinding DNS de un hostname público
 *  a una IP privada (el URL de descarga lo controla el PROVEEDOR, no el cliente). */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return true;
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) return true;
    const m = h.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (m) { const o = toOctets(m[1]); return !!o && isPrivateOctets(o); }
    return false;
  }
  const o = toOctets(h);
  return o ? isPrivateOctets(o) : false;
}

function extFromKind(kind: GenKind): string {
  return kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3";
}
function extFromMime(mime?: string): string | null {
  switch ((mime || "").toLowerCase().split(";")[0]) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "video/mp4": return "mp4";
    case "video/webm": return "webm";
    case "video/quicktime": return "mov";
    case "audio/mpeg": return "mp3";
    case "audio/wav": case "audio/x-wav": return "wav";
    case "audio/mp4": case "audio/aac": return "m4a";
    case "audio/ogg": return "ogg";
    default: return null;
  }
}
function extFromUrl(url: string): string | null {
  try {
    const ext = path.extname(new URL(url).pathname).replace(/^\./, "").toLowerCase();
    return ext && /^[a-z0-9]{1,5}$/.test(ext) ? ext : null;
  } catch {
    return null;
  }
}

export interface DownloadInput {
  url?: string;
  bytes?: Buffer;
  mimeType?: string;
  kind: GenKind;
  name: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

export async function downloadToAsset(input: DownloadInput): Promise<Asset> {
  let buf: Buffer;
  let ext: string;
  if (input.bytes) {
    buf = input.bytes;
    ext = extFromMime(input.mimeType) ?? extFromKind(input.kind);
  } else if (input.url) {
    const u = new URL(input.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Protocolo no permitido.");
    if (isPrivateHost(u.hostname)) throw new Error("URL no permitida (host privado/interno).");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(input.url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`descarga falló (HTTP ${res.status})`);
      const cl = Number(res.headers.get("content-length") || 0);
      if (cl > MAX_BYTES) throw new Error("archivo demasiado grande");
      // Stream con tope acumulado: aunque content-length mienta o falte, abortamos
      // en cuanto el cuerpo supere MAX_BYTES (no bufferizamos GBs en memoria).
      const reader = res.body?.getReader();
      if (!reader) {
        buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_BYTES) throw new Error("archivo demasiado grande");
      } else {
        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            total += value.byteLength;
            if (total > MAX_BYTES) { ctrl.abort(); throw new Error("archivo demasiado grande"); }
            chunks.push(value);
          }
        }
        buf = Buffer.concat(chunks);
      }
    } finally {
      clearTimeout(t);
    }
    ext = extFromUrl(input.url) ?? extFromMime(input.mimeType) ?? extFromKind(input.kind);
  } else {
    throw new Error("downloadToAsset requiere url o bytes.");
  }

  const id = newId("asset");
  const fileName = `${id}.${ext}`;
  await fs.mkdir(assetsDir(), { recursive: true });
  await fs.writeFile(path.join(assetsDir(), fileName), buf);

  const durationInFrames = input.durationSec && input.durationSec > 0 ? Math.max(1, Math.round(input.durationSec * 30)) : undefined;
  const asset: Asset = {
    id,
    name: input.name,
    kind: input.kind,
    src: `/assets/${fileName}`,
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(durationInFrames !== undefined ? { durationInFrames } : {}),
  };
  const saved = await addAsset(asset);
  if (saved.kind === "video") ensureVideoProxy(saved);
  return saved;
}
