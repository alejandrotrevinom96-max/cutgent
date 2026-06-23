import type { TrackProvider } from "./types";
import { replicateSam2Provider } from "./providers/replicate-sam2";
import { mockProvider } from "./providers/mock";

export const TRACK_PROVIDERS: Record<string, TrackProvider> = {
  "replicate-sam2": replicateSam2Provider,
  mock: mockProvider,
};

export function getTrackProvider(id: string): TrackProvider | undefined {
  return TRACK_PROVIDERS[id];
}

export * from "./types";
