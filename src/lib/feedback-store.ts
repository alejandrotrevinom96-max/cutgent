import "server-only";
import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import { dataDir } from "@/lib/paths";

/**
 * Log persistente de feedback de calibración: {features de una edición → outcome}.
 * Hace que el "gusto" se acumule (la mitad por-resultado). NO llama a servicios de
 * paga — solo almacena y deja que feedback-report correlacione. Patrón de store
 * clonado de asset-store / settings-store (hub global + ensureLoaded + escritura
 * atómica serializada).
 */

const DATA_DIR = dataDir();
const DATA_FILE = dataDir("feedback.json");

export type OutcomeSource = "predictor" | "retention" | "manual";

export interface FeedbackEntry {
  id: string;
  ts: number;
  projectId: string;
  label?: string;
  features: Record<string, number>; // {overall, cadence, beat_alignment, ...} (solo applicable)
  outcome: number; // 0..100
  source: OutcomeSource;
  note?: string;
}

interface FeedbackHub {
  entries: FeedbackEntry[];
  loaded: boolean;
}
const g = globalThis as unknown as { __cutgent_feedback?: FeedbackHub };
function hub(): FeedbackHub {
  if (!g.__cutgent_feedback) g.__cutgent_feedback = { entries: [], loaded: false };
  return g.__cutgent_feedback;
}

async function ensureLoaded(): Promise<void> {
  const h = hub();
  if (h.loaded) return;
  let raw: string;
  try {
    raw = await fs.readFile(DATA_FILE, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      await persistNow(h.entries); // bootstrap []
      h.loaded = true;
      return;
    }
    throw e;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    h.entries = Array.isArray(parsed) ? (parsed as FeedbackEntry[]) : [];
  } catch {
    await fs.rename(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`).catch(() => {});
    throw new Error("feedback.json corrupto: respaldado, requiere intervención.");
  }
  h.loaded = true;
}

async function persistNow(entries: FeedbackEntry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

let writeChain: Promise<unknown> = Promise.resolve();
function persist(entries: FeedbackEntry[]): Promise<void> {
  const run = writeChain.then(() => persistNow(entries));
  writeChain = run.catch(() => {});
  return run;
}

export async function appendFeedback(
  entry: Omit<FeedbackEntry, "id" | "ts"> & { id?: string; ts?: number },
): Promise<FeedbackEntry> {
  await ensureLoaded();
  const h = hub();
  const valid: FeedbackEntry = {
    ...entry,
    id: entry.id || `fdbk_${nanoid(8)}`,
    ts: entry.ts ?? Date.now(),
    outcome: Math.max(0, Math.min(100, entry.outcome)),
  };
  h.entries.push(valid);
  await persist(h.entries);
  return valid;
}

export async function listFeedback(projectId?: string): Promise<FeedbackEntry[]> {
  await ensureLoaded();
  const all = [...hub().entries];
  return projectId ? all.filter((e) => e.projectId === projectId) : all;
}
