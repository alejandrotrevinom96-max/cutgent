/**
 * Generación de media con IA usando las API keys del PROPIO usuario (BYO, sin
 * créditos ni markup — se le factura directo en su proveedor). Una sola interfaz
 * `Provider` normaliza proveedores SÍNCRONOS (OpenAI: devuelve bytes ya) y
 * ASÍNCRONOS (Replicate/fal: encolan → se hace poll). La ruta /api/generate no
 * ramifica por proveedor: usa start() y, si queda pendiente, poll().
 *
 * Las keys viven SOLO en el servidor (settings-store.getKey); el cliente/MCP
 * manda provider+kind+prompt+model, nunca la key. Cada adapter declara `apiHost`
 * y se valida (allowlist) antes de cada fetch saliente.
 */

export type GenKind = "image" | "video" | "audio";

export interface GenRequest {
  kind: GenKind;
  prompt: string;
  model?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  voiceId?: string;
  aspectRatio?: string;
  extra?: Record<string, unknown>;
}

export interface GenStartDone {
  state: "done";
  mediaUrl?: string;
  bytes?: Buffer;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}
export interface GenStartPending {
  state: "pending";
  providerJobId: string;
}
export type GenStart = GenStartDone | GenStartPending;

export interface GenPoll {
  state: "pending" | "done" | "error";
  progress?: number;
  mediaUrl?: string;
  bytes?: Buffer;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  error?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  kind: GenKind;
}

export interface Provider {
  id: string;
  label: string;
  requiredKey: string;
  /** Host que la llamada saliente DEBE tener (lo asegura el allowlist). */
  apiHost: string;
  models: ModelInfo[];
  defaultModel(kind: GenKind): string | undefined;
  supports(kind: GenKind): boolean;
  start(req: GenRequest, apiKey: string): Promise<GenStart>;
  /** Solo en proveedores ASÍNCRONOS. */
  poll?(providerJobId: string, apiKey: string, model: string): Promise<GenPoll>;
}

/** Forma de petición HTTP pura (para tests sin red). */
export interface HttpSpec {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}
