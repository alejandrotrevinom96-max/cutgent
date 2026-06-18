import "server-only";
import { promises as fs, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { applyCommand, CommandSchema, type Command } from "./commands";
import { createDefaultProject, newId } from "./factory";
import { ProjectSchema, type Project } from "./schema";
import { dataDir } from "./paths";

/**
 * Estado autoritativo en el proceso de Next. Soporta MÚLTIPLES proyectos
 * (cada clip viral es su propio proyecto). El "proyecto actual" está cargado en
 * memoria con su historial; el resto vive en disco. Los cambios se persisten y
 * se difunden por SSE como deltas. Un singleton en globalThis sobrevive al
 * hot-reload de dev.
 */

const DATA_DIR = dataDir();
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const INDEX_FILE = path.join(DATA_DIR, "projects.json");
const LEGACY_FILE = path.join(DATA_DIR, "project.json");

export interface ProjectMeta {
  id: string;
  name: string;
  /** "editor" = proyecto normal; "clip" = corto extraído de un fuente. */
  kind: "editor" | "clip";
  /** Si es un clip, el id del proyecto/fuente del que salió. */
  sourceId?: string;
  createdAt: number;
  updatedAt: number;
}

export type StoreMessage =
  | { kind: "snapshot"; version: number; document: Project; origin: string | null }
  | { kind: "command"; version: number; command: Command; origin: string | null };

type Subscriber = (msg: StoreMessage) => void;

interface Hub {
  doc: Project;
  loaded: boolean;
  subscribers: Set<Subscriber>;
  version: number;
  past: Project[];
  future: Project[];
  persistTimer: ReturnType<typeof setTimeout> | null;
  currentId: string;
  projects: ProjectMeta[];
  loadingPromise?: Promise<void>;
}

const HISTORY_CAP = 50;

const g = globalThis as unknown as { __claudit_hub?: Hub };

function hub(): Hub {
  if (!g.__claudit_hub) {
    const doc = createDefaultProject();
    g.__claudit_hub = {
      doc,
      loaded: false,
      subscribers: new Set(),
      version: 0,
      past: [],
      future: [],
      persistTimer: null,
      currentId: doc.id,
      projects: [],
    };
  }
  const h = g.__claudit_hub;
  if (!h.past) h.past = [];
  if (!h.future) h.future = [];
  if (!h.subscribers) h.subscribers = new Set();
  if (!h.projects) h.projects = [];
  installShutdownFlush();
  return h;
}

const projectFile = (id: string) => path.join(PROJECTS_DIR, `${id}.json`);
const now = () => Date.now();

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

// Memoizado: solo el primer llamador hace el trabajo; el resto espera la misma
// promesa (evita inicializaciones concurrentes que se pisen).
function ensureLoaded(): Promise<void> {
  const h = hub();
  if (h.loaded) return Promise.resolve();
  if (!h.loadingPromise) h.loadingPromise = doLoad();
  return h.loadingPromise;
}

async function doLoad(): Promise<void> {
  const h = hub();
  if (h.loaded) return;
  await fs.mkdir(PROJECTS_DIR, { recursive: true });

  const index = await readJson<{ currentId: string; projects: ProjectMeta[] }>(INDEX_FILE);

  if (index && index.projects.length > 0) {
    h.projects = index.projects;
    h.currentId = index.currentId;
  } else {
    // Primer arranque: migrar el legacy data/project.json si existe.
    const legacy = await readJson<unknown>(LEGACY_FILE);
    let doc: Project;
    try {
      doc = legacy ? ProjectSchema.parse(legacy) : createDefaultProject();
    } catch {
      doc = createDefaultProject();
    }
    const meta: ProjectMeta = {
      id: doc.id,
      name: doc.name,
      kind: "editor",
      createdAt: now(),
      updatedAt: now(),
    };
    h.projects = [meta];
    h.currentId = doc.id;
    await fs.writeFile(projectFile(doc.id), JSON.stringify(doc), "utf8");
    await saveIndex();
  }

  // Cargar el doc del proyecto actual.
  const current = await readJson<unknown>(projectFile(h.currentId));
  try {
    h.doc = current ? ProjectSchema.parse(current) : createDefaultProject();
  } catch {
    // Proyecto corrupto: NO lo sobrescribimos en silencio — lo respaldamos para
    // poder recuperarlo, y cargamos un default para no bloquear el arranque.
    await fs.rename(projectFile(h.currentId), `${projectFile(h.currentId)}.corrupt-${now()}`).catch(() => {});
    h.doc = createDefaultProject();
  }
  h.loaded = true;
}

/** Escritura atómica: tmp + rename (evita archivos a medias si crashea). */
async function atomicWrite(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, file);
}

async function saveIndex(): Promise<void> {
  const h = hub();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await atomicWrite(
    INDEX_FILE,
    JSON.stringify({ currentId: h.currentId, projects: h.projects }, null, 2),
  );
}

async function persistCurrent(): Promise<void> {
  const h = hub();
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  await atomicWrite(projectFile(h.currentId), JSON.stringify(h.doc));
  const meta = h.projects.find((p) => p.id === h.currentId);
  if (meta) {
    meta.updatedAt = now();
    meta.name = h.doc.name;
  }
  await saveIndex();
}

/** Autosave coalescado: una escritura del estado más reciente cada 500ms. */
function schedulePersist(): void {
  const h = hub();
  if (h.persistTimer) return;
  h.persistTimer = setTimeout(() => {
    h.persistTimer = null;
    void persistCurrent().catch(() => {});
  }, 500);
}

/** Flush SÍNCRONO del autosave pendiente (para apagado del proceso). */
function flushSync(): void {
  const h = hub();
  if (!h.persistTimer) return;
  clearTimeout(h.persistTimer);
  h.persistTimer = null;
  try {
    mkdirSync(PROJECTS_DIR, { recursive: true });
    writeFileSync(projectFile(h.currentId), JSON.stringify(h.doc));
    writeFileSync(
      INDEX_FILE,
      JSON.stringify({ currentId: h.currentId, projects: h.projects }, null, 2),
    );
  } catch {
    /* best-effort en apagado */
  }
}

function installShutdownFlush(): void {
  const gg = globalThis as unknown as { __claudit_shutdown?: boolean };
  if (gg.__claudit_shutdown) return;
  gg.__claudit_shutdown = true;
  process.once("beforeExit", flushSync);
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      flushSync();
      process.exit(0);
    });
  }
}

// ---------------------------------------------------------------------------
// Documento actual
// ---------------------------------------------------------------------------

export async function getDocument(): Promise<Project> {
  await ensureLoaded();
  return hub().doc;
}

export function getVersion(): number {
  return hub().version;
}

export function getHistoryState(): { canUndo: boolean; canRedo: boolean } {
  const h = hub();
  return { canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

function recordHistory(prev: Project): void {
  const h = hub();
  h.past.push(prev);
  if (h.past.length > HISTORY_CAP) h.past.shift();
  h.future = [];
}

export async function dispatch(rawCommand: unknown, origin: string | null = null): Promise<Project> {
  await ensureLoaded();
  const command: Command = CommandSchema.parse(rawCommand);
  const h = hub();
  const prev = h.doc;
  const next = applyCommand(prev, command);
  if (next === prev) return prev; // no-op: ni historial, ni versión, ni broadcast
  // Invariante: el doc del proyecto actual conserva su id (p.ej. load_document).
  if (next.id !== h.currentId) next.id = h.currentId;
  h.doc = next;
  recordHistory(prev);
  h.version++;
  schedulePersist();
  broadcast({ kind: "command", version: h.version, command, origin });
  return h.doc;
}

export async function undo(origin: string | null = null): Promise<Project> {
  await ensureLoaded();
  const h = hub();
  if (h.past.length === 0) return h.doc;
  const prev = h.past.pop() as Project;
  h.future.push(h.doc);
  if (h.future.length > HISTORY_CAP) h.future.shift();
  h.doc = prev;
  h.version++;
  schedulePersist();
  broadcast({ kind: "snapshot", version: h.version, document: h.doc, origin });
  return h.doc;
}

export async function redo(origin: string | null = null): Promise<Project> {
  await ensureLoaded();
  const h = hub();
  if (h.future.length === 0) return h.doc;
  const next = h.future.pop() as Project;
  h.past.push(h.doc);
  if (h.past.length > HISTORY_CAP) h.past.shift();
  h.doc = next;
  h.version++;
  schedulePersist();
  broadcast({ kind: "snapshot", version: h.version, document: h.doc, origin });
  return h.doc;
}

export async function setDocument(raw: unknown, origin: string | null = null): Promise<Project> {
  await ensureLoaded();
  const doc = ProjectSchema.parse(raw);
  const h = hub();
  // Invariante de id (como en dispatch): un PUT con id ajeno no debe sobrescribir
  // ni corromper el archivo del proyecto actual.
  if (doc.id !== h.currentId) doc.id = h.currentId;
  recordHistory(h.doc);
  h.doc = doc;
  h.version++;
  schedulePersist();
  broadcast({ kind: "snapshot", version: h.version, document: h.doc, origin });
  return h.doc;
}

// ---------------------------------------------------------------------------
// Gestión de proyectos
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<{ currentId: string; projects: ProjectMeta[] }> {
  await ensureLoaded();
  const h = hub();
  return { currentId: h.currentId, projects: h.projects };
}

/** Crea un proyecto nuevo (no cambia el actual). Devuelve su metadata. */
export async function createProject(opts: {
  name?: string;
  kind?: "editor" | "clip";
  sourceId?: string;
  document?: unknown;
}): Promise<ProjectMeta> {
  await ensureLoaded();
  const h = hub();
  const id = newId("proj");
  let doc: Project;
  try {
    doc = opts.document ? ProjectSchema.parse(opts.document) : createDefaultProject();
  } catch {
    doc = createDefaultProject();
  }
  doc.id = id;
  if (opts.name) doc.name = opts.name;
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  await fs.writeFile(projectFile(id), JSON.stringify(doc), "utf8");
  const meta: ProjectMeta = {
    id,
    name: doc.name,
    kind: opts.kind ?? "editor",
    sourceId: opts.sourceId,
    createdAt: now(),
    updatedAt: now(),
  };
  h.projects.push(meta);
  await saveIndex();
  return meta;
}

/** Abre un proyecto: guarda el actual, carga el pedido y difunde snapshot. */
export async function openProject(id: string, origin: string | null = null): Promise<Project> {
  await ensureLoaded();
  const h = hub();
  if (id === h.currentId) return h.doc;
  const meta = h.projects.find((p) => p.id === id);
  if (!meta) throw new Error(`Proyecto ${id} no encontrado`);
  if (h.persistTimer) {
    clearTimeout(h.persistTimer);
    h.persistTimer = null;
  }
  await persistCurrent(); // flush del actual antes de cambiar
  const loaded = await readJson<unknown>(projectFile(id));
  h.doc = loaded ? ProjectSchema.parse(loaded) : createDefaultProject();
  h.currentId = id;
  h.past = [];
  h.future = [];
  h.version++;
  await saveIndex();
  broadcast({ kind: "snapshot", version: h.version, document: h.doc, origin });
  return h.doc;
}

export async function deleteProject(id: string, origin: string | null = null): Promise<void> {
  await ensureLoaded();
  const h = hub();
  // Si borramos el proyecto actual, cancela el autosave pendiente para no
  // re-escribir el doc condenado.
  if (id === h.currentId && h.persistTimer) {
    clearTimeout(h.persistTimer);
    h.persistTimer = null;
  }
  h.projects = h.projects.filter((p) => p.id !== id);
  await fs.unlink(projectFile(id)).catch(() => {});
  if (h.projects.length === 0) {
    const meta = await createProject({ name: "Proyecto sin título" });
    await openProject(meta.id, origin);
    return;
  }
  if (h.currentId === id) {
    await openProject(h.projects[0].id, origin);
  } else {
    await saveIndex();
  }
}

function broadcast(msg: StoreMessage): void {
  const h = hub();
  for (const sub of h.subscribers) sub(msg);
}

export function subscribe(sub: Subscriber): () => void {
  const h = hub();
  h.subscribers.add(sub);
  return () => h.subscribers.delete(sub);
}
