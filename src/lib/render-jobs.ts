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

/** Un item de un export por lotes (un render con su formato/resolución). */
export interface BatchItem {
  jobId: string;
  label: string;
  format: string;
  quality: string;
  gpu: boolean;
  width?: number;
  height?: number;
  status: Job["status"];
  progress: number;
  url?: string;
  error?: string;
}
export interface Batch {
  id: string;
  createdAt: number;
  items: BatchItem[];
  currentIndex: number;
  status: "queued" | "running" | "done" | "partial" | "error";
}

interface Registry {
  jobs: Map<string, Job>;
  batches: Map<string, Batch>;
}

const g = globalThis as unknown as { __cutgent_render_jobs?: Registry };

function registry(): Registry {
  if (!g.__cutgent_render_jobs) {
    g.__cutgent_render_jobs = { jobs: new Map<string, Job>(), batches: new Map<string, Batch>() };
  }
  if (!g.__cutgent_render_jobs.batches) g.__cutgent_render_jobs.batches = new Map<string, Batch>();
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

// --- Export por lotes ------------------------------------------------------

export function createBatch(id: string, items: BatchItem[]): Batch {
  const batch: Batch = { id, createdAt: Date.now(), items, currentIndex: 0, status: "queued" };
  registry().batches.set(id, batch);
  return batch;
}

export function getBatch(id: string): Batch | undefined {
  return registry().batches.get(id);
}

/** Patch de un item del lote + recálculo del estado agregado. */
export function updateBatchItem(batchId: string, jobId: string, patch: Partial<BatchItem>): Batch | undefined {
  const batch = registry().batches.get(batchId);
  if (!batch) return undefined;
  const item = batch.items.find((it) => it.jobId === jobId);
  if (!item) return batch;
  Object.assign(item, patch);
  const done = batch.items.filter((it) => it.status === "done").length;
  const err = batch.items.filter((it) => it.status === "error").length;
  if (done + err === batch.items.length) {
    batch.status = err === 0 ? "done" : done === 0 ? "error" : "partial";
    // Evicta el lote terminado tras el TTL (contado desde el FIN del lote, no por job).
    setTimeout(() => registry().batches.delete(batchId), DONE_TTL_MS).unref?.();
  } else {
    batch.status = "running";
  }
  return batch;
}

export function setBatchStatus(id: string, status: Batch["status"], currentIndex?: number): void {
  const batch = registry().batches.get(id);
  if (!batch) return;
  batch.status = status;
  if (currentIndex !== undefined) batch.currentIndex = currentIndex;
}
