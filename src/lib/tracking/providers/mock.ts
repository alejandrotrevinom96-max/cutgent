import type { TrackProvider, TrackStart, TrackPoll, MediaInfo } from "../types";
import type { TrackBbox } from "../../track-map";

/**
 * Provider MOCK: sin red, sin key. Devuelve una trayectoria conocida → verifica
 * TODO el pipeline (parse → track-map → RDP → dispatchBatch) sin gastar créditos.
 * Se selecciona con CUTGENT_TRACK_PROVIDER=mock.
 */

/** Objeto 100×100 cruzando en diagonal, 30 frames, ocluido en [10..12]. */
export function mockBoxes(): TrackBbox[] {
  const out: TrackBbox[] = [];
  for (let f = 0; f < 30; f++) {
    out.push({ frame: f, cx: 200 + f * 40, cy: 150 + f * 20, w: 100, h: 100, visible: !(f >= 10 && f <= 12) });
  }
  return out;
}

export const mockProvider: TrackProvider = {
  id: "mock",
  requiredKey: null,
  async startTrack(): Promise<TrackStart> {
    return { predId: "mock_pred" };
  },
  async pollTrack(): Promise<TrackPoll> {
    return { status: "done", progress: 1, output: { mock: true } };
  },
  parseOutput(_output: unknown, _media: MediaInfo): TrackBbox[] {
    return mockBoxes();
  },
};
