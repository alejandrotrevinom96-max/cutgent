import "server-only";

/**
 * Registro en memoria de los trabajos de render.
 *
 * Igual que server-store.ts, vive en un singleton sobre globalThis para
 * sobrevivir a los hot-reloads de Next.js en desarrollo. No se persiste a
 * disco: si el proceso muere, los trabajos en curso se pierden (el MP4
 * resultante, si llegó a escribirse, sigue en public/renders).
 */

export interface Job {
  id: string;
  status: "rendering" | "done" | "error";
  progress: number;
  url?: string;
  error?: string;
  /** Epoch ms de inicio, para estimar tiempo restante. */
  startedAt?: number;
}

interface Registry {
  jobs: Map<string, Job>;
}

const g = globalThis as unknown as { __cutgent_render_jobs?: Registry };

function registry(): Registry {
  if (!g.__cutgent_render_jobs) {
    g.__cutgent_render_jobs = { jobs: new Map<string, Job>() };
  }
  return g.__cutgent_render_jobs;
}

/** Crea un trabajo nuevo en estado 'rendering' y lo devuelve. */
export function createJob(id: string): Job {
  const job: Job = { id, status: "rendering", progress: 0, startedAt: Date.now() };
  registry().jobs.set(id, job);
  return job;
}

/** Devuelve el trabajo o undefined si no existe. */
export function getJob(id: string): Job | undefined {
  return registry().jobs.get(id);
}

/** Tiempo que se conserva un job terminado antes de evictarlo. */
const DONE_TTL_MS = 10 * 60 * 1000;

/** Aplica un patch parcial sobre un trabajo existente. Devuelve el resultado. */
export function updateJob(id: string, patch: Partial<Job>): Job | undefined {
  const jobs = registry().jobs;
  const current = jobs.get(id);
  if (!current) return undefined;
  const next: Job = { ...current, ...patch, id: current.id };
  jobs.set(id, next);
  // Evicta los terminados tras un TTL para no acumular en memoria.
  if (next.status === "done" || next.status === "error") {
    setTimeout(() => registry().jobs.delete(id), DONE_TTL_MS).unref?.();
  }
  return next;
}
