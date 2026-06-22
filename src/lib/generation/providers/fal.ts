import type { GenRequest, GenStart, GenPoll, Provider, HttpSpec } from "../types";

/**
 * fal.ai (hub: imagen + video, cola ASÍNCRONA). Auth: `Key <FAL_KEY>` (NO Bearer).
 * Submit → POST https://queue.fal.run/{model} → { request_id }. Status →
 * /requests/{id}/status (IN_QUEUE|IN_PROGRESS|COMPLETED). Result → /requests/{id}.
 * Se guarda SOLO request_id y se reconstruyen las URLs desde el model para que el
 * host del allowlist sea siempre queue.fal.run.
 */
const HOST = "queue.fal.run";
const IMG = "fal-ai/flux/dev";
const VID = "fal-ai/veo3.1";

export function buildFalSubmit(req: GenRequest, model: string, apiKey: string): HttpSpec {
  const body: Record<string, unknown> = { prompt: req.prompt };
  if (req.imageUrl) body.image_url = req.imageUrl;
  if (req.width && req.height) body.image_size = { width: req.width, height: req.height };
  return {
    url: `https://${HOST}/${model}`,
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
// OJO: status/result se construyen desde el `response_url` que fal devuelve en el
// submit. fal usa el NAMESPACE del modelo, NO la variante completa
// (fal-ai/flux/dev → .../fal-ai/flux/requests/...), así que reconstruir la URL
// desde el model id daba 405 en modelos con sub-ruta. response_url ya viene
// correcto y sobre queue.fal.run (sigue pasando el guard de host).
export function buildFalStatus(resultUrl: string, apiKey: string): HttpSpec {
  return { url: `${resultUrl}/status`, method: "GET", headers: { Authorization: `Key ${apiKey}` } };
}
export function buildFalResult(resultUrl: string, apiKey: string): HttpSpec {
  return { url: resultUrl, method: "GET", headers: { Authorization: `Key ${apiKey}` } };
}

export function parseFalStatus(json: { status?: string }): "pending" | "done" {
  return json.status === "COMPLETED" ? "done" : "pending";
}
export function parseFalResult(json: {
  images?: { url?: string }[];
  image?: { url?: string };
  video?: { url?: string };
  audio_url?: string;
  audio?: { url?: string };
}): string | undefined {
  return json.video?.url || json.images?.[0]?.url || json.image?.url || json.audio_url || json.audio?.url;
}

async function fetchJson<T>(spec: HttpSpec): Promise<T> {
  if (new URL(spec.url).host !== HOST) throw new Error(`host no permitido: ${new URL(spec.url).host}`);
  const res = await fetch(spec.url, { method: spec.method, headers: spec.headers, body: spec.body });
  const text = await res.text();
  let json: unknown = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) throw new Error(`fal ${res.status}: ${text.slice(0, 200)}`);
  return json as T;
}

export const falProvider: Provider = {
  id: "fal",
  label: "fal.ai",
  requiredKey: "FAL_KEY",
  apiHost: HOST,
  models: [
    { id: IMG, label: "FLUX dev (imagen)", kind: "image" },
    { id: "fal-ai/flux/schnell", label: "FLUX schnell (imagen rápida)", kind: "image" },
    { id: VID, label: "Veo 3.1 (video)", kind: "video" },
    { id: "fal-ai/kling-video/v3/pro/image-to-video", label: "Kling v3 (img→video)", kind: "video" },
  ],
  defaultModel: (k) => (k === "image" ? IMG : k === "video" ? VID : undefined),
  supports: (k) => k === "image" || k === "video",
  async start(req, apiKey) {
    const model = req.model || (req.kind === "video" ? VID : IMG);
    const json = await fetchJson<{ request_id?: string; response_url?: string }>(buildFalSubmit(req, model, apiKey));
    if (!json.request_id || !json.response_url) throw new Error("fal no devolvió request_id/response_url");
    // Guardamos el response_url COMPLETO como providerJobId (trae el namespace
    // correcto del modelo); poll lo usa tal cual para status y result.
    return { state: "pending", providerJobId: json.response_url } as GenStart;
  },
  async poll(providerJobId, apiKey) {
    const st = await fetchJson<{ status?: string }>(buildFalStatus(providerJobId, apiKey));
    if (parseFalStatus(st) !== "done") return { state: "pending" } as GenPoll;
    const result = await fetchJson<Parameters<typeof parseFalResult>[0]>(buildFalResult(providerJobId, apiKey));
    const url = parseFalResult(result);
    return url ? { state: "done", mediaUrl: url } : { state: "error", error: "fal: resultado sin URL de media" };
  },
};
