import type { GenRequest, GenStart, GenPoll, Provider, HttpSpec } from "../types";

/**
 * Replicate (hub: imagen + video, ASÍNCRONO create-and-poll). Auth: Bearer.
 * Modelos oficiales → POST /v1/models/{owner}/{name}/predictions (sin version).
 * Prefer: wait=60 mantiene la conexión abierta hasta ~60s (imágenes rápidas
 * pueden volver ya succeeded → done). Poll por id en /v1/predictions/{id}.
 */
const HOST = "api.replicate.com";
const IMG = "black-forest-labs/flux-2-pro";
const VID = "google/veo-3.1";

interface ReplicatePrediction {
  id?: string;
  status?: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: unknown;
}

export function pickUrl(output: unknown): string | undefined {
  if (Array.isArray(output)) return typeof output[0] === "string" ? output[0] : undefined;
  return typeof output === "string" ? output : undefined;
}

// --- pure builders / parsers (testeables sin red) --------------------------
export function buildReplicateStart(req: GenRequest, model: string, apiKey: string): HttpSpec {
  const input: Record<string, unknown> = { prompt: req.prompt };
  if (req.imageUrl) input.image_input = [req.imageUrl];
  if (req.aspectRatio) input.aspect_ratio = req.aspectRatio;
  return {
    url: `https://${HOST}/v1/models/${model}/predictions`,
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Prefer: "wait=60" },
    body: JSON.stringify({ input }),
  };
}

export function buildReplicatePoll(providerJobId: string, apiKey: string): HttpSpec {
  return {
    url: `https://${HOST}/v1/predictions/${providerJobId}`,
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  };
}

/** Normaliza una predicción a un GenPoll (start lo reinterpreta a GenStart). */
export function parseReplicate(json: ReplicatePrediction): GenPoll & { id?: string } {
  const s = json.status;
  if (s === "succeeded") return { state: "done", mediaUrl: pickUrl(json.output), id: json.id };
  if (s === "failed" || s === "canceled") return { state: "error", error: String(json.error ?? s), id: json.id };
  return { state: "pending", id: json.id };
}

async function fetchJson(spec: HttpSpec): Promise<ReplicatePrediction> {
  if (new URL(spec.url).host !== HOST) throw new Error(`host no permitido: ${new URL(spec.url).host}`);
  const res = await fetch(spec.url, { method: spec.method, headers: spec.headers, body: spec.body });
  const text = await res.text();
  let json: ReplicatePrediction = {};
  try { json = JSON.parse(text) as ReplicatePrediction; } catch { /* ignore */ }
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${String(json.error ?? text).slice(0, 200)}`);
  return json;
}

export const replicateProvider: Provider = {
  id: "replicate",
  label: "Replicate",
  requiredKey: "REPLICATE_API_TOKEN",
  apiHost: HOST,
  models: [
    { id: IMG, label: "FLUX.2 Pro (imagen)", kind: "image" },
    { id: VID, label: "Veo 3.1 (video)", kind: "video" },
  ],
  defaultModel: (k) => (k === "image" ? IMG : k === "video" ? VID : undefined),
  supports: (k) => k === "image" || k === "video",
  async start(req, apiKey) {
    const model = req.model || (req.kind === "video" ? VID : IMG);
    const json = await fetchJson(buildReplicateStart(req, model, apiKey));
    const p = parseReplicate(json);
    if (p.state === "done") return { state: "done", mediaUrl: p.mediaUrl } as GenStart;
    if (p.state === "error") throw new Error(p.error || "Replicate falló");
    if (!p.id) throw new Error("Replicate no devolvió id de predicción");
    return { state: "pending", providerJobId: p.id };
  },
  async poll(providerJobId, apiKey) {
    const json = await fetchJson(buildReplicatePoll(providerJobId, apiKey));
    const p = parseReplicate(json);
    return { state: p.state, mediaUrl: p.mediaUrl, error: p.error };
  },
};
