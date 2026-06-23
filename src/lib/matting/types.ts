/**
 * Contrato de un proveedor de matting / rotoscopía por IA (recorte de sujeto).
 * Gemelo de tracking/types.ts: provider REAL (fal VEED background removal, BYO-key)
 * y MOCK intercambiables. parseOutput (PURO) aísla el formato de salida del modelo
 * → la URL del WebM-alfa del sujeto recortado.
 */

export interface MatteStart {
  predId: string;
}

export interface MattePoll {
  status: "pending" | "done" | "error";
  progress?: number;
  output?: unknown; // payload crudo del proveedor
  error?: string;
}

export interface MatteProvider {
  id: string; // "fal-veed" | "mock"
  requiredKey: string | null; // "FAL_KEY" | null (mock no pide key)
  startMatte(videoUrl: string, key: string, model: string): Promise<MatteStart>;
  pollMatte(predId: string, key: string): Promise<MattePoll>;
  /** PURO: payload crudo → URL del WebM-alfa del recorte (o null si no se reconoce). */
  parseOutput(output: unknown): string | null;
}
