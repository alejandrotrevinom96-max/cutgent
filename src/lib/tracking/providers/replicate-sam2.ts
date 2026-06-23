import type { TrackProvider, TrackStart, TrackPoll, MediaInfo } from "../types";
import type { TrackBbox } from "../../track-map";

/**
 * Adapter SAM 2 video vía Replicate (BYO REPLICATE_API_TOKEN). La lógica PURA
 * (buildStartSpec / parseOutput / maskToBbox) está separada de la red para poder
 * verificarla sin key. El formato de salida exacto de SAM2 es el riesgo #1: se
 * pinea la versión del modelo y parseOutput maneja dos formas (bbox-JSON y
 * máscara) y falla EXPLÍCITAMENTE ante una desconocida (nunca keyframes basura).
 */

const HOST = "api.replicate.com";

interface HttpSpec {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

// --- PURO -------------------------------------------------------------------

/** model = "owner/name:versionHash" → endpoint con versión. */
export function buildStartSpec(videoUrl: string, key: string, model: string): HttpSpec {
  const version = model.includes(":") ? model.split(":")[1] : "";
  if (!version) throw new Error("El modelo SAM2 debe incluir :versionHash (owner/name:hash)");
  return {
    url: `https://${HOST}/v1/predictions`,
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version, input: { input_video: videoUrl } }),
  };
}

export function buildPollSpec(predId: string, key: string): HttpSpec {
  return {
    url: `https://${HOST}/v1/predictions/${predId}`,
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  };
}

/** PURO y determinista: bounding box de los píxeles no-cero de una máscara 2D. */
export function maskToBbox(
  mask: number[][],
): { cx: number; cy: number; w: number; h: number; visible: boolean } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (let y = 0; y < mask.length; y++) {
    const row = mask[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x]) {
        any = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!any) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return { cx: minX + w / 2, cy: minY + h / 2, w, h, visible: true };
}

/** Normaliza una caja en cualquier forma común a {cx,cy,w,h} en px del media. */
function bboxFromAny(f: Record<string, unknown>, media: MediaInfo): TrackBbox | null {
  const frame = Number(f.frame);
  const raw = (f.box ?? f.bbox) as unknown;
  if (raw == null || !Number.isFinite(frame)) return null;
  let cx: number;
  let cy: number;
  let w: number;
  let h: number;
  if (Array.isArray(raw) && raw.length === 4) {
    // [x, y, w, h] (top-left + tamaño)
    const [x, y, bw, bh] = raw.map(Number);
    w = bw;
    h = bh;
    cx = x + bw / 2;
    cy = y + bh / 2;
  } else if (typeof raw === "object") {
    const o = raw as Record<string, number>;
    if ("cx" in o && "cy" in o) {
      cx = o.cx;
      cy = o.cy;
      w = o.w;
      h = o.h;
    } else {
      w = o.w;
      h = o.h;
      cx = o.x + o.w / 2;
      cy = o.y + o.h / 2;
    }
  } else {
    return null;
  }
  if (![cx, cy, w, h].every(Number.isFinite)) return null;
  // Si parecen normalizados 0..1, escalar al media nativo.
  if (cx <= 1 && cy <= 1 && w <= 1 && h <= 1) {
    cx *= media.width;
    cy *= media.height;
    w *= media.width;
    h *= media.height;
  }
  const visible = f.visible === undefined ? true : Boolean(f.visible);
  return { frame, cx, cy, w, h, visible };
}

/** PURO. Acepta (A) JSON bbox-por-frame o (B) máscaras-por-frame. */
export function parseOutput(output: unknown, media: MediaInfo): TrackBbox[] {
  if (!Array.isArray(output) || output.length === 0) {
    throw new Error("Salida SAM2 no reconocida (se esperaba un array por frame; ¿el modelo devuelve URL?). Validar contra el model card de la versión pineada.");
  }
  const first = output[0] as Record<string, unknown>;
  // (A) bbox-JSON
  if (first && (("box" in first) || ("bbox" in first))) {
    return (output as Record<string, unknown>[])
      .map((f) => bboxFromAny(f, media))
      .filter((b): b is TrackBbox => b !== null);
  }
  // (B) máscara por frame
  if (first && Array.isArray((first as { mask?: unknown }).mask)) {
    return (output as { frame: number; mask: number[][]; visible?: boolean }[])
      .map((f) => {
        const b = maskToBbox(f.mask);
        return b ? ({ frame: Number(f.frame), ...b } as TrackBbox) : null;
      })
      .filter((b): b is TrackBbox => b !== null);
  }
  throw new Error("Formato de salida SAM2 no reconocido (ni bbox ni máscara inline). Revisar la versión del modelo.");
}

// --- RED (allowlist) --------------------------------------------------------

async function fetchJson(spec: HttpSpec): Promise<Record<string, unknown>> {
  if (new URL(spec.url).host !== HOST) throw new Error(`Host no permitido: ${new URL(spec.url).host}`);
  const res = await fetch(spec.url, { method: spec.method, headers: spec.headers, body: spec.body });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* deja json vacío */
  }
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${String(json.error ?? text).slice(0, 200)}`);
  return json;
}

export const replicateSam2Provider: TrackProvider = {
  id: "replicate-sam2",
  requiredKey: "REPLICATE_API_TOKEN",
  async startTrack(videoUrl, key, model): Promise<TrackStart> {
    const j = await fetchJson(buildStartSpec(videoUrl, key, model));
    if (!j.id) throw new Error("Replicate no devolvió id de predicción");
    return { predId: String(j.id) };
  },
  async pollTrack(predId, key): Promise<TrackPoll> {
    const j = await fetchJson(buildPollSpec(predId, key));
    const s = j.status;
    if (s === "succeeded") return { status: "done", output: j.output, progress: 1 };
    if (s === "failed" || s === "canceled") return { status: "error", error: String(j.error ?? s) };
    return { status: "pending" };
  },
  parseOutput,
};
