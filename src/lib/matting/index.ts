import type { MatteProvider } from "./types";
import { falVeedProvider } from "./providers/fal-veed";
import { mockProvider } from "./providers/mock";

export const MATTE_PROVIDERS: Record<string, MatteProvider> = {
  "fal-veed": falVeedProvider,
  mock: mockProvider,
};

export function getMatteProvider(id: string): MatteProvider | undefined {
  return MATTE_PROVIDERS[id];
}

export * from "./types";
