import type { MatteProvider, MatteStart, MattePoll } from "../types";

/**
 * Provider MOCK: sin red, sin key. Devuelve una URL de recorte conocida (local) →
 * verifica todo el pipeline (route → run → update_clip → render) sin créditos.
 * Se selecciona con CUTGENT_MATTE_PROVIDER=mock. La URL es relativa: runMatting la
 * detecta como local y la usa directo (sin descargar).
 */
const MOCK_MATTE_URL = "/assets/matte_test.webm";

export const mockProvider: MatteProvider = {
  id: "mock",
  requiredKey: null,
  async startMatte(): Promise<MatteStart> {
    return { predId: "mock_matte" };
  },
  async pollMatte(): Promise<MattePoll> {
    return { status: "done", progress: 1, output: { video: { url: MOCK_MATTE_URL } } };
  },
  parseOutput(output: unknown): string | null {
    const o = output as { video?: { url?: string } } | null;
    return o?.video?.url ?? null;
  },
};
