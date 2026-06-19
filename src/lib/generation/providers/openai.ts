import type { GenRequest, GenStart, Provider, HttpSpec } from "../types";

/**
 * OpenAI (SÍNCRONO, sin poll). Imagen → /v1/images/generations (gpt-image-1.5,
 * SIEMPRE devuelve b64_json, nunca url). Audio TTS → /v1/audio/speech (bytes
 * binarios). Auth: Bearer.
 */
const HOST = "api.openai.com";
const IMG = "gpt-image-1.5";
const TTS = "gpt-4o-mini-tts";

export function sizeFor(req: GenRequest): "1024x1024" | "1536x1024" | "1024x1536" {
  const w = req.width ?? 0, h = req.height ?? 0;
  if (w && h) {
    if (w > h) return "1536x1024";
    if (h > w) return "1024x1536";
  }
  return "1024x1024";
}

export function buildOpenAIImage(req: GenRequest, model: string, apiKey: string): HttpSpec {
  return {
    url: `https://${HOST}/v1/images/generations`,
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: req.prompt, size: sizeFor(req), quality: "high", n: 1 }),
  };
}
export function buildOpenAITTS(req: GenRequest, model: string, apiKey: string): HttpSpec {
  return {
    url: `https://${HOST}/v1/audio/speech`,
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, voice: req.voiceId || "coral", input: req.prompt, response_format: "mp3" }),
  };
}
export function parseOpenAIImage(json: { data?: { b64_json?: string }[] }): Buffer {
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI no devolvió imagen (b64_json)");
  return Buffer.from(b64, "base64");
}

function assertHost(url: string) {
  if (new URL(url).host !== HOST) throw new Error(`host no permitido: ${new URL(url).host}`);
}

export const openaiProvider: Provider = {
  id: "openai",
  label: "OpenAI",
  requiredKey: "OPENAI_API_KEY",
  apiHost: HOST,
  models: [
    { id: IMG, label: "GPT-Image 1.5 (imagen)", kind: "image" },
    { id: TTS, label: "GPT-4o mini TTS (voz)", kind: "audio" },
  ],
  defaultModel: (k) => (k === "image" ? IMG : k === "audio" ? TTS : undefined),
  supports: (k) => k === "image" || k === "audio",
  async start(req, apiKey): Promise<GenStart> {
    if (req.kind === "audio") {
      const spec = buildOpenAITTS(req, req.model || TTS, apiKey);
      assertHost(spec.url);
      const res = await fetch(spec.url, { method: spec.method, headers: spec.headers, body: spec.body });
      if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { state: "done", bytes: Buffer.from(await res.arrayBuffer()), mimeType: "audio/mpeg" };
    }
    const spec = buildOpenAIImage(req, req.model || IMG, apiKey);
    assertHost(spec.url);
    const res = await fetch(spec.url, { method: spec.method, headers: spec.headers, body: spec.body });
    const text = await res.text();
    if (!res.ok) throw new Error(`OpenAI image ${res.status}: ${text.slice(0, 200)}`);
    const size = sizeFor(req);
    const [w, h] = size.split("x").map(Number);
    return { state: "done", bytes: parseOpenAIImage(JSON.parse(text)), mimeType: "image/png", width: w, height: h };
  },
};
