import "server-only";
import type { TrackKeyframes } from "./track-map";

/**
 * Registro en memoria de trabajos de TRACKING/VFX (clon de generation-jobs.ts).
 * Singleton sobre globalThis para sobrevivir hot-reloads; no se persiste. El
 * resultado (keyframes) ya queda escrito en el documento vía set_track_keyframes,
 * así que perder el job no pierde el trabajo.
 */

export interface VfxJob {
  id: string;
  status: "tracking" | "done" | "error";
  progress: number; // 0..1
  clipId: string;
  provider: string; // "replicate-sam2" | "mock"
  model: string;
  error?: string;
  startedAt?: number;
  keyframes?: TrackKeyframes; // resultado de tracking (informativo)
  postedProps?: string[]; // propiedades aplicadas al clip (x/y/scale/opacity)
  matteSrc?: string; // resultado de matting (src del recorte WebM-alfa aplicado)
}

interface Registry {
  jobs: Map<string, VfxJob>;
}
const g = globalThis as unknown as { __cutgent_vfx_jobs?: Registry };
function registry(): Registry {
  if (!g.__cutgent_vfx_jobs) g.__cutgent_vfx_jobs = { jobs: new Map<string, VfxJob>() };
  return g.__cutgent_vfx_jobs;
}

export function createVfxJob(id: string, seed: Pick<VfxJob, "clipId" | "provider" | "model">): VfxJob {
  const job: VfxJob = { id, status: "tracking", progress: 0, startedAt: Date.now(), ...seed };
  registry().jobs.set(id, job);
  return job;
}
export function getVfxJob(id: string): VfxJob | undefined {
  return registry().jobs.get(id);
}

const DONE_TTL_MS = 10 * 60 * 1000;
export function updateVfxJob(id: string, patch: Partial<VfxJob>): VfxJob | undefined {
  const jobs = registry().jobs;
  const current = jobs.get(id);
  if (!current) return undefined;
  const next: VfxJob = { ...current, ...patch, id: current.id };
  jobs.set(id, next);
  if (next.status === "done" || next.status === "error") {
    setTimeout(() => registry().jobs.delete(id), DONE_TTL_MS).unref?.();
  }
  return next;
}
