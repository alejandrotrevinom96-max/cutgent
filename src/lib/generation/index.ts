import { replicateProvider } from "./providers/replicate";
import { falProvider } from "./providers/fal";
import { openaiProvider } from "./providers/openai";
import type { GenKind, Provider } from "./types";

/** Allowlist DE FACTO: solo proveedores registrados aquí son alcanzables. */
export const PROVIDERS: Record<string, Provider> = {
  replicate: replicateProvider,
  fal: falProvider,
  openai: openaiProvider,
};
export const PROVIDER_IDS = Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS[id];
}

/** Metadatos públicos (sin keys) para la UI. `hasKey` lo añade la ruta. */
export function listProviderInfo(): { id: string; label: string; requiredKey: string; models: { id: string; label: string; kind: GenKind }[] }[] {
  return Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, requiredKey: p.requiredKey, models: p.models }));
}

export * from "./types";
