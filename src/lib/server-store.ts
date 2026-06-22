import "server-only";
import { promises as fs, writeFileSync, mkdirSync } from "fs";
import { createHash } from "crypto";
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

/** Metadata de un snapshot/versión persistente (sin el doc; vive en el índice). */
export interface SnapshotMeta {
  id: string;
  projectId: string;
  kind: "auto" | "manual";
  label?: string;
  createdAt: number;
  version: number;
  docHash: string;
  size: number;
  clipCount?: number;
}

export type StoreMessage =
  | { kind: "snapshot"; version: number; document: Project; origin: string | null; canUndo?: boolean; canRedo?: boolean }
  | { kind: "command"; version: number; command: Command; origin: string | null; canUndo?: boolean; canRedo?: boolean };

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
  /** Cadencia de auto-snapshots del proyecto ACTUAL (por-proyecto). */
  lastAutoSnapshotAt: number;
  lastSnapshotHash?: string;
}

const HISTORY_CAP = 50;

const g = globalThis as unknown as { __cutgent_hub?: Hub };

function hub(): Hub {
  if (!g.__cutgent_hub) {
    const doc = createDefaultProject();
    g.__cutgent_hub = {
      doc,
      loaded: false,
      subscribers: new Set(),
      version: 0,
      past: [],
      future: [],
      persistTimer: null,
      currentId: doc.id,
      projects: [],
      lastAutoSnapshotAt: 0,
    };
  }
  const h = g.__cutgent_hub;
  if (!h.past) h.past = [];
  if (!h.future) h.future = [];
  if (!h.subscribers) h.subscribers = new Set();
  if (!h.projects) h.projects = [];
  if (h.lastAutoSnapshotAt == null) h.lastAutoSnapshotAt = 0;
  installShutdownFlush();
  return h;
}

const projectFile = (id: string) => path.join(PROJECTS_DIR, `${id}.json`);
const snapshotsDir = (id: string) => path.join(PROJECTS_DIR, `${id}.snapshots`);
const snapshotFile = (id: string, snapId: string) => path.join(snapshotsDir(id), `${snapId}.json`);
const snapshotIndex = (id: string) => path.join(snapshotsDir(id), "index.json");
const now = () => Date.now();

/** Snapshots automáticos: cada 5 min de actividad, cap 20 por proyecto. */
const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_SNAPSHOT_CAP = 20;
const docHash = (s: string) => createHash("sha1").update(s).digest("hex");

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
  // Arranca el reloj de cadencia al cargar: el primer auto-snapshot llega a los
  // 5 min de editar, no en la primera edición de la sesión.
  h.lastAutoSnapshotAt = now();
  h.loaded = true;
}

/** Escritura atómica: tmp ÚNICO + rename (evita archivos a medias y que dos
 *  escrituras concurrentes compartan el mismo tmp y se pisen). */
let tmpSeq = 0;
async function atomicWrite(file: string, data: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${tmpSeq++}.tmp`;
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

// ---------------------------------------------------------------------------
// Snapshots / historial de versiones PERSISTENTE (sobrevive al reinicio)
// ---------------------------------------------------------------------------

/** Conserva todos los manuales + los AUTO_SNAPSHOT_CAP autos más recientes;
 *  borra los archivos de los autos podados y reescribe el índice (atómico). */
async function pruneAndWriteIndex(pid: string, list: SnapshotMeta[]): Promise<void> {
  const autos = list.filter((s) => s.kind === "auto").sort((a, b) => b.createdAt - a.createdAt);
  const drop = autos.slice(AUTO_SNAPSHOT_CAP);
  if (drop.length) {
    const dropIds = new Set(drop.map((s) => s.id));
    for (const s of drop) await fs.unlink(snapshotFile(pid, s.id)).catch(() => {});
    list = list.filter((s) => !dropIds.has(s.id));
  }
  await fs.mkdir(snapshotsDir(pid), { recursive: true });
  await atomicWrite(snapshotIndex(pid), JSON.stringify({ snapshots: list }, null, 2));
}

/** Cola de escritura de snapshots: serializa la I/O (archivo + read-modify-write
 *  del índice) para que dos saveSnapshot concurrentes no pierdan entradas. */
let snapshotChain: Promise<unknown> = Promise.resolve();

/** Guarda un snapshot persistente del proyecto ACTUAL (full Project + meta). */
export async function saveSnapshot(opts: { kind: "auto" | "manual"; label?: string }): Promise<SnapshotMeta> {
  await ensureLoaded();
  const h = hub();
  const pid = h.currentId;
  // Captura el doc como STRING inmutable AHORA (no dependemos de h.doc cuando la
  // I/O encolada corra: pudo cambiar o cambiar de proyecto).
  const data = JSON.stringify(h.doc);
  const hash = docHash(data);
  const meta: SnapshotMeta = {
    id: newId("snap"),
    projectId: pid,
    kind: opts.kind,
    ...(opts.label ? { label: opts.label.slice(0, 80) } : {}),
    createdAt: now(),
    version: h.version,
    docHash: hash,
    size: data.length,
    clipCount: h.doc.tracks.reduce((n, t) => n + t.clips.length, 0),
  };
  h.lastSnapshotHash = hash;
  if (opts.kind === "auto") h.lastAutoSnapshotAt = meta.createdAt;
  // Archivo construido desde el string capturado (sin re-serializar el doc).
  const fileContent = `{"meta":${JSON.stringify(meta)},"doc":${data}}`;
  const run = snapshotChain.then(async (): Promise<SnapshotMeta> => {
    await fs.mkdir(snapshotsDir(pid), { recursive: true });
    await atomicWrite(snapshotFile(pid, meta.id), fileContent);
    const idx = (await readJson<{ snapshots: SnapshotMeta[] }>(snapshotIndex(pid)))?.snapshots ?? [];
    idx.push(meta);
    await pruneAndWriteIndex(pid, idx);
    return meta;
  });
  snapshotChain = run.catch(() => {});
  return run;
}

/** Lista los snapshots del proyecto actual (más reciente primero, sin docs). */
export async function listSnapshots(): Promise<{ currentId: string; snapshots: SnapshotMeta[] }> {
  await ensureLoaded();
  const h = hub();
  const idx = (await readJson<{ snapshots: SnapshotMeta[] }>(snapshotIndex(h.currentId)))?.snapshots ?? [];
  return { currentId: h.currentId, snapshots: idx.sort((a, b) => b.createdAt - a.createdAt) };
}

/** Captura un auto-snapshot si toca (cadencia por tiempo + dedupe por hash).
 *  Síncrono hasta disparar: reclama el slot ANTES de encolar el guardado para que
 *  dos dispatches seguidos no generen autos duplicados (la cadena difiere la I/O). */
function maybeAutoSnapshot(): void {
  const h = hub();
  if (now() - h.lastAutoSnapshotAt < AUTO_SNAPSHOT_INTERVAL_MS) return;
  const hash = docHash(JSON.stringify(h.doc));
  if (h.lastSnapshotHash && hash === h.lastSnapshotHash) return; // nada cambió
  h.lastAutoSnapshotAt = now();
  h.lastSnapshotHash = hash;
  void saveSnapshot({ kind: "auto" }).catch(() => {});
}

/** Restaura el proyecto actual a un snapshot. Toma un auto de seguridad antes,
 *  es UNDO-able (recordHistory) y refresca a los clientes vía broadcast snapshot. */
export async function restoreSnapshot(id: string, origin: string | null = null): Promise<Project> {
  await ensureLoaded();
  const h = hub();
  const pid = h.currentId;
  const idx = (await readJson<{ snapshots: SnapshotMeta[] }>(snapshotIndex(pid)))?.snapshots ?? [];
  if (!idx.some((s) => s.id === id)) throw new Error("Snapshot no encontrado");
  // Red de seguridad: snapshot INCONDICIONAL del estado actual antes de pisarlo
  // (acotado por el FIFO de autos), para que una mala restauración sea reversible.
  await saveSnapshot({ kind: "auto", label: "Antes de restaurar" });
  const raw = await readJson<{ meta: SnapshotMeta; doc: unknown }>(snapshotFile(pid, id));
  if (!raw) throw new Error("Archivo de snapshot ilegible");
  const doc = ProjectSchema.parse(raw.doc); // si es incompatible, lanza (no sustituye)
  if (doc.id !== pid) doc.id = pid; // invariante de id (como dispatch/setDocument)
  recordHistory(h.doc);
  h.doc = doc;
  h.version++;
  schedulePersist();
  broadcast({ kind: "snapshot", version: h.version, document: h.doc, origin });
  return h.doc;
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
  const gg = globalThis as unknown as { __cutgent_shutdown?: boolean };
  if (gg.__cutgent_shutdown) return;
  gg.__cutgent_shutdown = true;
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
  maybeAutoSnapshot();
  broadcast({ kind: "command", version: h.version, command, origin });
  return h.doc;
}

/** Aplica un LOTE de comandos como UNA sola operación: un único registro de
 *  historial (un Ctrl+Z deshace todo el lote) y un solo broadcast (snapshot). */
export async function dispatchBatch(rawCommands: unknown[], origin: string | null = null): Promise<Project> {
  await ensureLoaded();
  const commands = rawCommands.map((c) => CommandSchema.parse(c));
  const h = hub();
  const prev = h.doc;
  let next = prev;
  for (const command of commands) next = applyCommand(next, command);
  if (next === prev) return prev; // no-op
  if (next.id !== h.currentId) next.id = h.currentId;
  h.doc = next;
  recordHistory(prev); // UNA entrada para todo el lote
  h.version++;
  schedulePersist();
  maybeAutoSnapshot();
  // Snapshot único: otros clientes se sincronizan; el originador re-aplica el
  // mismo doc que ya tenía optimista (no hay supresión de eco para snapshots).
  broadcast({ kind: "snapshot", version: h.version, document: h.doc, origin });
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
  maybeAutoSnapshot();
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
  // Cadencia de snapshots es por-proyecto: reinicia el reloj al abrir (primer
  // auto a los 5 min de empezar a editar este proyecto).
  h.lastAutoSnapshotAt = now();
  h.lastSnapshotHash = undefined;
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
  // Borra toda la carpeta de snapshots del proyecto eliminado (no dejar huérfanos).
  await fs.rm(snapshotsDir(id), { recursive: true, force: true }).catch(() => {});
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
  // Adjuntamos el estado de historial: así TODOS los clientes (incluidos los que
  // reciben una edición de OTRO cliente vía SSE, p.ej. el MCP) refrescan sus
  // botones Undo/Redo sin esperar a su siguiente acción manual.
  const withHistory = { ...msg, ...getHistoryState() } as StoreMessage;
  for (const sub of h.subscribers) sub(withHistory);
}

export function subscribe(sub: Subscriber): () => void {
  const h = hub();
  h.subscribers.add(sub);
  return () => h.subscribers.delete(sub);
}
