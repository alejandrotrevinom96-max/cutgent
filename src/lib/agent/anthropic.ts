import "server-only";

/**
 * Cliente mínimo de la API de Mensajes de Anthropic por `fetch` — SIN SDK (no
 * añadimos dependencias). La key es del usuario (BYO) y se usa SOLO aquí,
 * server-side; nunca llega al cliente. El loop tool-use vive en la ruta.
 */

export const DEFAULT_MODEL = "claude-opus-4-8";
/** Allowlist: el cliente solo puede pedir uno de estos (no strings arbitrarios). */
export const ALLOWED_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export function resolveModel(m: unknown): string {
  return typeof m === "string" && (ALLOWED_MODELS as readonly string[]).includes(m) ? m : DEFAULT_MODEL;
}

// --- tipos del protocolo (subset que usamos) -------------------------------
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface AnthropicResponse {
  id: string;
  role: "assistant";
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | string;
}

/** Una llamada (no streaming) a /v1/messages. Lanza en error de red/API. */
export async function callClaude(opts: {
  apiKey: string;
  model: string;
  system: string;
  tools: AnthropicTool[];
  messages: AnthropicMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<AnthropicResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8192,
      system: opts.system,
      tools: opts.tools,
      messages: opts.messages,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // 401 = key inválida; lo distinguimos para que la UI pida re-pegar la key.
    throw new AnthropicError(res.status, body.slice(0, 600));
  }
  return (await res.json()) as AnthropicResponse;
}

export class AnthropicError extends Error {
  constructor(public status: number, public detail: string) {
    super(`Anthropic API ${status}: ${detail}`);
    this.name = "AnthropicError";
  }
}
