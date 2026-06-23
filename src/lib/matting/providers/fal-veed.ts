import type { MatteProvider, MatteStart, MattePoll } from "../types";

/**
 * Adapter de matting vía fal (VEED video background removal, BYO FAL_KEY). Usa la
 * cola async de fal (queue.fal.run) por ser video. La parte PURA
 * (buildStartSpec/parseOutput) está aislada de la red para verificar sin key. El
 * formato exacto de la respuesta de fal es el riesgo #1: parseOutput falla
 * EXPLÍCITAMENTE ante forma desconocida (nunca asigna un matte basura). La mecánica
 * de cola/campos se valida en el smoke test con key real.
 *
 * predId codifica `${model}|${requestId}` porque la URL de estado de fal necesita
 * ambos (pollMatte solo recibe predId).
 */

const HOST = "queue.fal.run";

interface HttpSpec {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

// --- PURO -------------------------------------------------------------------

/** model = ruta del modelo en fal, p.ej. "veed/video-background-removal". */
export function buildStartSpec(videoUrl: string, key: string, model: string): HttpSpec {
  return {
    url: `https://${HOST}/${model}`,
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ video_url: videoUrl }),
  };
}
export function buildStatusSpec(model: string, requestId: string, key: string): HttpSpec {
  return {
    url: `https://${HOST}/${model}/requests/${requestId}/status`,
    method: "GET",
    headers: { Authorization: `Key ${key}` },
  };
}
export function buildResultSpec(model: string, requestId: string, key: string): HttpSpec {
  return {
    url: `https://${HOST}/${model}/requests/${requestId}`,
    method: "GET",
    headers: { Authorization: `Key ${key}` },
  };
}

/** PURO: resultado fal → URL del WebM/MOV-alfa del recorte, o null. */
export function parseOutput(output: unknown): string | null {
  const o = output as { video?: { url?: string }; image?: { url?: string } } | null;
  const url = o?.video?.url ?? o?.image?.url ?? null;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function splitPred(predId: string): { model: string; requestId: string } {
  const i = predId.indexOf("|");
  if (i < 0) throw new Error(`predId de matte inválido: ${predId}`);
  return { model: predId.slice(0, i), requestId: predId.slice(i + 1) };
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
  if (!res.ok) throw new Error(`fal ${res.status}: ${String(json.error ?? text).slice(0, 200)}`);
  return json;
}

export const falVeedProvider: MatteProvider = {
  id: "fal-veed",
  requiredKey: "FAL_KEY",
  async startMatte(videoUrl, key, model): Promise<MatteStart> {
    const j = await fetchJson(buildStartSpec(videoUrl, key, model));
    const requestId = (j.request_id ?? j.requestId) as string | undefined;
    if (!requestId) throw new Error("fal no devolvió request_id");
    return { predId: `${model}|${requestId}` };
  },
  async pollMatte(predId, key): Promise<MattePoll> {
    const { model, requestId } = splitPred(predId);
    const st = await fetchJson(buildStatusSpec(model, requestId, key));
    const s = st.status;
    if (s === "COMPLETED") {
      const res = await fetchJson(buildResultSpec(model, requestId, key));
      return { status: "done", progress: 1, output: res };
    }
    if (s === "IN_QUEUE" || s === "IN_PROGRESS") return { status: "pending" };
    return { status: "error", error: String(st.error ?? s ?? "fal error") };
  },
  parseOutput,
};
