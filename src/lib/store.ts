"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import { applyCommand, findClip, type Command } from "./commands";
import { createDefaultProject, newId } from "./factory";
import type { Asset, Clip, Marker, Project } from "./schema";

/** Color por defecto de una nota de edición (distinto del ámbar de capítulos). */
export const NOTE_COLOR = "#38bdf8";

/**
 * Client-side editor state. The document is kept in sync with the server:
 * every mutation is applied optimistically here, then POSTed to the API; the
 * server broadcasts to all clients over SSE. We ignore SSE echoes of our own
 * edits (matched by clientId) and apply everyone else's (e.g. MCP-driven).
 */

export interface RenderState {
  status: "idle" | "rendering" | "done" | "error";
  progress: number;
  url?: string;
  error?: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  kind: "editor" | "clip";
  sourceId?: string;
  createdAt: number;
  updatedAt: number;
}

interface EditorState {
  clientId: string;
  document: Project;
  connected: boolean;
  /** Última versión del documento confirmada por el servidor (para deltas SSE). */
  serverVersion: number;

  // viewport / interaction
  /** Clip "primario" (el que edita el Inspector). */
  selectedClipId: string | null;
  /** Selección múltiple (incluye al primario). */
  selectedClipIds: string[];
  /** Pista destino resaltada al arrastrar un clip entre pistas (feedback visual). */
  dropTargetTrackId: string | null;
  setDropTargetTrackId: (id: string | null) => void;
  currentFrame: number;
  playing: boolean;
  pixelsPerFrame: number;

  /** Marcas de entrada/salida (I/O) para acotar selección/export. */
  inFrame: number | null;
  outFrame: number | null;
  setInFrame: (f: number | null) => void;
  setOutFrame: (f: number | null) => void;

  /** Vista activa: editor normal o el "Clipper" (separar video largo en clips). */
  view: "editor" | "clipper";
  setView: (v: "editor" | "clipper") => void;

  // notas de edición ancladas a timestamp (anotar → revisar → aplicar)
  /** Frame donde el compositor de notas está abierto (null = cerrado). */
  noteDraftFrame: number | null;
  /** Filtro del panel de notas. */
  notesFilter: "pending" | "all";
  setNotesFilter: (f: "pending" | "all") => void;
  openNoteComposer: (frame?: number) => void;
  closeNoteComposer: () => void;
  addNote: (
    note: string,
    opts?: { frame?: number; frameEnd?: number; source?: "text" | "voice"; color?: string },
  ) => void;
  updateNote: (id: string, patch: Partial<Marker>) => void;
  resolveNote: (id: string, status: "applied" | "dismissed" | "pending") => void;
  removeNote: (id: string) => void;
  /** Marcador clásico (capítulo permanente). */
  addChapter: (frame?: number, label?: string) => void;

  assets: Asset[];
  render: RenderState;

  // lifecycle
  connect: () => void;

  // selection / playback
  selectClip: (id: string | null) => void;
  toggleClipSelection: (id: string) => void;
  /** Reemplaza la selección por una lista explícita de ids (p.ej. marquee). */
  setSelectedClipIds: (ids: string[]) => void;
  /** Selecciona TODOS los clips del documento (Ctrl/Cmd+A). */
  selectAll: () => void;
  setCurrentFrame: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  setPixelsPerFrame: (ppf: number) => void;

  // historial
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;

  // mutations (go through the server)
  runCommand: (command: Command) => Promise<void>;
  runCommands: (commands: Command[]) => Promise<void>;

  // local-only optimistic patch for high-frequency drags; commit via runCommand
  previewClipLocal: (clipId: string, patch: Partial<Clip>) => void;

  // portapapeles y borrado (soporta selección múltiple)
  clipboard: { clips: { clip: Clip; trackId: string; start: number }[] } | null;
  copySelectedClip: () => void;
  pasteClip: () => void;
  deleteSelectedClip: (ripple?: boolean) => void;

  // helpers
  selectedClip: () => Clip | null;
  loadDocument: (doc: Project) => Promise<void>;
  resync: () => Promise<void>;

  // assets
  refreshAssets: () => Promise<void>;
  setRender: (r: Partial<RenderState>) => void;

  // proyectos (multi-proyecto)
  projects: ProjectMeta[];
  currentProjectId: string;
  refreshProjects: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  createProject: (opts?: { name?: string; kind?: "editor" | "clip" }) => Promise<ProjectMeta | null>;
  deleteProject: (id: string) => Promise<void>;
}

const API = {
  command: "/api/document/command",
  document: "/api/document",
  stream: "/api/document/stream",
  assets: "/api/assets",
  undo: "/api/document/undo",
  redo: "/api/document/redo",
};

export const useEditor = create<EditorState>((set, get) => ({
  clientId: nanoid(10),
  document: createDefaultProject(),
  connected: false,
  serverVersion: 0,

  selectedClipId: null,
  selectedClipIds: [],
  dropTargetTrackId: null,
  currentFrame: 0,
  playing: false,
  pixelsPerFrame: 6,
  inFrame: null,
  outFrame: null,
  setInFrame: (inFrame) => set({ inFrame }),
  setOutFrame: (outFrame) => set({ outFrame }),
  view: "editor",
  setView: (view) => set({ view }),

  noteDraftFrame: null,
  notesFilter: "pending",
  setNotesFilter: (notesFilter) => set({ notesFilter }),

  openNoteComposer: (frame) =>
    set({ noteDraftFrame: Math.max(0, Math.round(frame ?? get().currentFrame)), playing: false }),
  closeNoteComposer: () => set({ noteDraftFrame: null }),

  addNote: (note, opts) => {
    const text = note.trim();
    if (!text) return;
    const frame = Math.max(0, Math.round(opts?.frame ?? get().noteDraftFrame ?? get().currentFrame));
    const marker: Marker = {
      id: newId("note"),
      frame,
      label: "",
      color: opts?.color ?? NOTE_COLOR,
      kind: "note",
      note: text,
      status: "pending",
      source: opts?.source ?? "text",
      ...(opts?.frameEnd != null ? { frameEnd: Math.max(frame, Math.round(opts.frameEnd)) } : {}),
    };
    void get().runCommand({ type: "add_marker", marker });
    set({ noteDraftFrame: null });
  },

  updateNote: (id, patch) => {
    void get().runCommand({ type: "update_marker", markerId: id, patch });
  },

  resolveNote: (id, status) => {
    void get().runCommand({ type: "update_marker", markerId: id, patch: { status } });
  },

  removeNote: (id) => {
    void get().runCommand({ type: "remove_marker", markerId: id });
  },

  addChapter: (frame, label) => {
    const marker: Marker = {
      id: newId("mk"),
      frame: Math.max(0, Math.round(frame ?? get().currentFrame)),
      label: label ?? "",
      color: "#f59e0b",
      kind: "chapter",
      status: "pending",
      source: "text",
    };
    void get().runCommand({ type: "add_marker", marker });
  },

  assets: [],
  render: { status: "idle", progress: 0 },
  canUndo: false,
  canRedo: false,
  projects: [],
  currentProjectId: "",
  clipboard: null,

  connect: () => {
    if (typeof window === "undefined" || get().connected) return;
    set({ connected: true });

    // Snapshot inicial (rápido) + assets; el SSE volverá a enviar un snapshot.
    void get().resync();
    get().refreshAssets();
    get().refreshProjects();

    const es = new EventSource(API.stream);
    es.onmessage = (ev) => {
      let msg: unknown;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      const m = msg as
        | { kind: "snapshot"; version: number; document: Project; origin: string | null }
        | { kind: "command"; version: number; command: Command; origin: string | null };

      if (m.kind === "snapshot") {
        // Ignora snapshots más viejos que el estado ya aplicado (monotonicidad).
        if (m.version < get().serverVersion) return;
        set({ document: m.document, serverVersion: m.version });
        // Poda la selección a clips que aún existen.
        const sel = get().selectedClipIds.filter((id) => findClip(get().document, id));
        set({ selectedClipIds: sel, selectedClipId: sel[sel.length - 1] ?? null });
        return;
      }
      if (m.kind === "command") {
        // Eco de nuestra propia edición optimista: solo avanzamos la versión.
        if (m.origin === get().clientId) {
          set({ serverVersion: m.version });
          return;
        }
        // Delta en orden → aplicar; si hay salto de versión → resync completo.
        if (m.version === get().serverVersion + 1) {
          set({ document: applyCommand(get().document, m.command), serverVersion: m.version });
        } else if (m.version > get().serverVersion + 1) {
          void get().resync();
        }
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };
  },

  selectClip: (id) => set({ selectedClipId: id, selectedClipIds: id ? [id] : [] }),

  setDropTargetTrackId: (id) => {
    // Evita re-render si no cambia (se llama por cada pointermove).
    if (get().dropTargetTrackId !== id) set({ dropTargetTrackId: id });
  },

  toggleClipSelection: (id) =>
    set((s) => {
      const has = s.selectedClipIds.includes(id);
      const ids = has ? s.selectedClipIds.filter((x) => x !== id) : [...s.selectedClipIds, id];
      return { selectedClipIds: ids, selectedClipId: ids.length ? ids[ids.length - 1] : null };
    }),
  setSelectedClipIds: (ids) =>
    set({ selectedClipIds: ids, selectedClipId: ids.length ? ids[ids.length - 1] : null }),
  selectAll: () => {
    const ids = get().document.tracks.flatMap((t) => t.clips.map((c) => c.id));
    set({ selectedClipIds: ids, selectedClipId: ids.length ? ids[ids.length - 1] : null });
  },
  setCurrentFrame: (frame) => set({ currentFrame: Math.max(0, Math.round(frame)) }),
  setPlaying: (playing) => set({ playing }),
  setPixelsPerFrame: (ppf) => set({ pixelsPerFrame: Math.max(0.5, Math.min(40, ppf)) }),

  undo: async () => {
    try {
      const res = await fetch(API.undo, { method: "POST", headers: { "x-client-id": get().clientId } });
      const data = await res.json();
      if (data.document) set({ document: data.document });
      if (typeof data.version === "number") set({ serverVersion: data.version });
      set({ canUndo: !!data.canUndo, canRedo: !!data.canRedo });
    } catch {
      await get().resync();
    }
  },

  redo: async () => {
    try {
      const res = await fetch(API.redo, { method: "POST", headers: { "x-client-id": get().clientId } });
      const data = await res.json();
      if (data.document) set({ document: data.document });
      if (typeof data.version === "number") set({ serverVersion: data.version });
      set({ canUndo: !!data.canUndo, canRedo: !!data.canRedo });
    } catch {
      await get().resync();
    }
  },

  runCommand: async (command) => {
    // optimistic
    set({ document: applyCommand(get().document, command), canUndo: true, canRedo: false });
    try {
      const res = await fetch(API.command, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-id": get().clientId },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) {
        await get().resync(); // comando rechazado → re-sincroniza
        return;
      }
      // Reconcilia historial con la verdad del server (por si el cap lo recortó).
      const data = await res.json().catch(() => null);
      if (data && typeof data.canUndo === "boolean") {
        set({ canUndo: !!data.canUndo, canRedo: !!data.canRedo });
      }
    } catch {
      await get().resync();
    }
  },

  runCommands: async (commands) => {
    let doc = get().document;
    for (const c of commands) doc = applyCommand(doc, c);
    set({ document: doc, canUndo: true, canRedo: false });
    try {
      const res = await fetch(API.command, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-id": get().clientId },
        body: JSON.stringify({ commands }),
      });
      if (!res.ok) {
        await get().resync();
        return;
      }
      // Reconcilia historial con la verdad del server (por si el cap lo recortó).
      const data = await res.json().catch(() => null);
      if (data && typeof data.canUndo === "boolean") {
        set({ canUndo: !!data.canUndo, canRedo: !!data.canRedo });
      }
    } catch {
      await get().resync();
    }
  },

  previewClipLocal: (clipId, patch) => {
    // Structural-sharing update (no full clone) — cheap enough for 60fps drags
    // even on 20–40 min projects.
    set({
      document: applyCommand(get().document, {
        type: "update_clip",
        clipId,
        patch: patch as Record<string, unknown>,
      }),
    });
  },

  selectedClip: () => {
    const id = get().selectedClipId;
    if (!id) return null;
    return findClip(get().document, id)?.clip ?? null;
  },

  copySelectedClip: () => {
    const ids = get().selectedClipIds;
    const doc = get().document;
    const clips = ids
      .map((id) => {
        const f = findClip(doc, id);
        return f ? { clip: JSON.parse(JSON.stringify(f.clip)), trackId: f.track.id, start: f.clip.start } : null;
      })
      .filter(Boolean) as { clip: Clip; trackId: string; start: number }[];
    if (clips.length) set({ clipboard: { clips } });
  },

  pasteClip: () => {
    const cb = get().clipboard;
    if (!cb || !cb.clips.length) return;
    const doc = get().document;
    const minStart = Math.min(...cb.clips.map((c) => c.start));
    const base = get().currentFrame;
    const newIds: string[] = [];
    const cmds: Command[] = [];
    for (const item of cb.clips) {
      const track =
        doc.tracks.find((t) => t.id === item.trackId) ??
        doc.tracks.find((t) => t.kind === "media") ??
        doc.tracks[0];
      if (!track) continue;
      const id = newId("clip");
      newIds.push(id);
      const clip = {
        ...JSON.parse(JSON.stringify(item.clip)),
        id,
        start: base + (item.start - minStart),
      } as Clip;
      cmds.push({ type: "add_clip", trackId: track.id, clip });
    }
    if (cmds.length) void get().runCommands(cmds);
    set({ selectedClipIds: newIds, selectedClipId: newIds[newIds.length - 1] ?? null });
  },

  deleteSelectedClip: (ripple = false) => {
    const ids = get().selectedClipIds;
    if (!ids.length) return;
    set({ selectedClipId: null, selectedClipIds: [] });
    void get().runCommands(
      ids.map((id) =>
        ripple ? { type: "ripple_delete", clipId: id } : { type: "remove_clip", clipId: id },
      ),
    );
  },

  loadDocument: async (doc) => {
    set({ document: doc });
    const res = await fetch(API.document, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-client-id": get().clientId },
      body: JSON.stringify({ document: doc }),
    });
    const v = Number(res.headers.get("x-doc-version"));
    if (Number.isFinite(v) && v > 0) set({ serverVersion: v });
    // Un reemplazo total queda en el historial: undo disponible, redo limpio.
    set({
      canUndo: res.headers.get("x-can-undo") === "true",
      canRedo: res.headers.get("x-can-redo") === "true",
    });
  },

  resync: async () => {
    try {
      const res = await fetch(API.document);
      const version = Number(res.headers.get("x-doc-version") ?? 0);
      // Estado de historial real del server (cabeceras) → botones Undo/Redo fieles.
      const canUndo = res.headers.get("x-can-undo") === "true";
      const canRedo = res.headers.get("x-can-redo") === "true";
      const document = (await res.json()) as Project;
      set({ document, serverVersion: version, canUndo, canRedo });
      const sel = get().selectedClipIds.filter((id) => findClip(document, id));
      set({ selectedClipIds: sel, selectedClipId: sel[sel.length - 1] ?? null });
    } catch {
      /* offline; SSE reenviará un snapshot al reconectar */
    }
  },

  refreshAssets: async () => {
    try {
      const assets = await fetch(API.assets).then((r) => r.json());
      if (Array.isArray(assets)) set({ assets });
    } catch {
      /* assets API optional */
    }
  },

  setRender: (r) => set({ render: { ...get().render, ...r } }),

  refreshProjects: async () => {
    try {
      const data = await fetch("/api/projects").then((r) => r.json());
      if (data && Array.isArray(data.projects)) {
        set({ projects: data.projects, currentProjectId: data.currentId });
      }
    } catch {
      /* opcional */
    }
  },

  openProject: async (id) => {
    try {
      const res = await fetch("/api/projects/open", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-id": get().clientId },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.document) {
        set({ document: data.document, currentProjectId: id, selectedClipId: null });
        if (typeof data.version === "number") set({ serverVersion: data.version });
        // Historial del proyecto recién abierto (server-side).
        if (typeof data.canUndo === "boolean") {
          set({ canUndo: !!data.canUndo, canRedo: !!data.canRedo });
        }
      }
      await get().refreshProjects();
    } catch {
      await get().resync();
    }
  },

  createProject: async (opts) => {
    try {
      const meta = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-id": get().clientId },
        body: JSON.stringify({ name: opts?.name, kind: opts?.kind }),
      }).then((r) => r.json());
      await get().refreshProjects();
      return meta as ProjectMeta;
    } catch {
      return null;
    }
  },

  deleteProject: async (id) => {
    try {
      await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-client-id": get().clientId },
      });
      await get().refreshProjects();
    } catch {
      /* ignore */
    }
  },
}));
