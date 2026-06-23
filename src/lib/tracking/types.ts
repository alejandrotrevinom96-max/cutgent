import type { TrackBbox } from "../track-map";

/**
 * Contrato de un proveedor de tracking. Diseñado para tener un provider REAL
 * (Replicate SAM2, BYO-key) y uno MOCK (determinista, sin red) intercambiables,
 * de modo que TODO el pipeline (parse → track-map → RDP → comandos) se verifica
 * sin gastar créditos. El parseo del payload crudo a TrackBbox[] es del adapter
 * (parseOutput, PURO) para aislar el riesgo del formato de salida del modelo.
 */

export interface TrackStart {
  predId: string;
}

export interface TrackPoll {
  status: "pending" | "done" | "error";
  progress?: number; // 0..1 si el proveedor lo da
  output?: unknown; // payload crudo (JSON bbox o referencia a máscara)
  error?: string;
}

/** Dims nativas del media — para normalizar coords y para mask→bbox. */
export interface MediaInfo {
  width: number;
  height: number;
}

export interface TrackProvider {
  id: string; // "replicate-sam2" | "mock"
  requiredKey: string | null; // "REPLICATE_API_TOKEN" | null (mock no pide key)
  /** Lanza el tracking. videoUrl = URL pública del media. */
  startTrack(videoUrl: string, key: string, model: string): Promise<TrackStart>;
  pollTrack(predId: string, key: string): Promise<TrackPoll>;
  /** PURO: payload crudo → bboxes en px del media nativo. */
  parseOutput(output: unknown, media: MediaInfo): TrackBbox[];
}
