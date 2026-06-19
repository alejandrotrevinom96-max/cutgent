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
export function buildFalStatus(model: string, reqId: string, apiKey: string): HttpSpec {
  return { url: `https://${HOST}/${model}/requests/${reqId}/status`, method: "GET", headers: { Authorization: `Key ${apiKey}` } };
}
export function buildFalResult(model: string, reqId: string, apiKey: string): HttpSpec {
  return { url: `https://${HOST}/${model}/requests/${reqId}`, method: "GET", headers: { Authorization: `Key ${apiKey}` } };
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
    const json = await fetchJson<{ request_id?: string }>(buildFalSubmit(req, model, apiKey));
    if (!json.request_id) throw new Error("fal no devolvió request_id");
    return { state: "pending", providerJobId: json.request_id } as GenStart;
  },
  async poll(providerJobId, apiKey, model) {
    const st = await fetchJson<{ status?: string }>(buildFalStatus(model, providerJobId, apiKey));
    if (parseFalStatus(st) !== "done") return { state: "pending" } as GenPoll;
    const result = await fetchJson<Parameters<typeof parseFalResult>[0]>(buildFalResult(model, providerJobId, apiKey));
    const url = parseFalResult(result);
    return url ? { state: "done", mediaUrl: url } : { state: "error", error: "fal: resultado sin URL de media" };
  },
};
