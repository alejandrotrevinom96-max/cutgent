import "server-only";
import type { Asset } from "./schema";
import type { GenKind } from "./generation/types";

/**
 * Registro en memoria de trabajos de GENERACIÓN (clon de render-jobs.ts).
 * Singleton sobre globalThis para sobrevivir hot-reloads; no se persiste. Si el
 * proceso muere se pierde el job, pero el asset ya quedó en data/assets.json.
 */

export interface GenJob {
  id: string;
  status: "generating" | "done" | "error";
  progress: number;
  kind: GenKind;
  provider: string;
  model: string;
  prompt: string;
  error?: string;
  startedAt?: number;
  asset?: Asset;
}

interface Registry {
  jobs: Map<string, GenJob>;
}
const g = globalThis as unknown as { __cutgent_generation_jobs?: Registry };
function registry(): Registry {
  if (!g.__cutgent_generation_jobs) g.__cutgent_generation_jobs = { jobs: new Map<string, GenJob>() };
  return g.__cutgent_generation_jobs;
}

export function createGenJob(id: string, seed: Pick<GenJob, "kind" | "provider" | "model" | "prompt">): GenJob {
  const job: GenJob = { id, status: "generating", progress: 0, startedAt: Date.now(), ...seed };
  registry().jobs.set(id, job);
  return job;
}
export function getGenJob(id: string): GenJob | undefined {
  return registry().jobs.get(id);
}

const DONE_TTL_MS = 10 * 60 * 1000;
export function updateGenJob(id: string, patch: Partial<GenJob>): GenJob | undefined {
  const jobs = registry().jobs;
  const current = jobs.get(id);
  if (!current) return undefined;
  const next: GenJob = { ...current, ...patch, id: current.id };
  jobs.set(id, next);
  if (next.status === "done" || next.status === "error") {
    setTimeout(() => registry().jobs.delete(id), DONE_TTL_MS).unref?.();
  }
  return next;
}
