"use client";

import { useMemo, useState } from "react";
import {
  StickyNote,
  Plus,
  Copy,
  Check,
  X,
  Trash2,
  Mic,
  RotateCcw,
  Eraser,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import type { Marker } from "@/lib/schema";

/** frames → "m:ss" para los sellos de tiempo del panel. */
function timecode(frames: number, fps: number): string {
  const total = frames / fps;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-panel text-[var(--info)]",
  applied: "bg-panel text-[var(--ok)]",
  dismissed: "bg-panel text-muted",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  applied: "Aplicada",
  dismissed: "Descartada",
};

export function NotesPanel() {
  const fps = useEditor((s) => s.document.fps);
  const markers = useEditor((s) => s.document.markers ?? []);
  const filter = useEditor((s) => s.notesFilter);
  const setFilter = useEditor((s) => s.setNotesFilter);
  const setCurrentFrame = useEditor((s) => s.setCurrentFrame);
  const openComposer = useEditor((s) => s.openNoteComposer);
  const updateNote = useEditor((s) => s.updateNote);
  const resolveNote = useEditor((s) => s.resolveNote);
  const removeNote = useEditor((s) => s.removeNote);
  const currentFrame = useEditor((s) => s.currentFrame);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const notes = useMemo(() => {
    const all = markers.filter((m) => m.kind === "note");
    const shown = filter === "pending" ? all.filter((m) => (m.status ?? "pending") === "pending") : all;
    return [...shown].sort((a, b) => a.frame - b.frame);
  }, [markers, filter]);

  const pendingCount = useMemo(
    () => markers.filter((m) => m.kind === "note" && (m.status ?? "pending") === "pending").length,
    [markers],
  );
  const appliedCount = useMemo(
    () => markers.filter((m) => m.kind === "note" && m.status === "applied").length,
    [markers],
  );

  const copyForAssistant = async () => {
    const pending = markers
      .filter((m) => m.kind === "note" && (m.status ?? "pending") === "pending")
      .sort((a, b) => a.frame - b.frame);
    if (!pending.length) return;
    const lines = pending.map((m) => {
      const range = m.frameEnd != null ? `–${timecode(m.frameEnd, fps)}/${m.frameEnd}` : "";
      return `[${timecode(m.frame, fps)}/${m.frame}${range}] ${m.note ?? ""}`;
    });
    const text =
      "Aplica estas notas de edición al proyecto actual usando las herramientas del editor. " +
      "Cada línea es [tiempo/frame] instrucción. Al terminar cada una, márcala con resolve_note(applied):\n\n" +
      lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard bloqueado: no-op */
    }
  };

  const clearApplied = () => {
    markers
      .filter((m) => m.kind === "note" && (m.status === "applied" || m.status === "dismissed"))
      .forEach((m) => removeNote(m.id));
  };

  const startEdit = (m: Marker) => {
    setEditingId(m.id);
    setDraft(m.note ?? "");
  };
  const commitEdit = () => {
    if (editingId) updateNote(editingId, { note: draft.trim() });
    setEditingId(null);
    setDraft("");
  };

  return (
    <section className="flex w-full flex-col border-t border-border bg-panel text-text">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <StickyNote size={16} className="text-[var(--info)]" />
        <h2 className="text-sm font-semibold">Notas</h2>
        {pendingCount > 0 && (
          <span className="rounded-full bg-[var(--info)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--info)]">
            {pendingCount} pendiente{pendingCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openComposer(currentFrame)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-2"
            title="Añadir nota en el frame actual (tecla N)"
          >
            <Plus size={13} /> Nota aquí
          </button>
          <button
            type="button"
            onClick={copyForAssistant}
            disabled={pendingCount === 0}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-muted hover:text-text disabled:opacity-40"
            title="Copia las notas pendientes con formato para pegárselas al asistente"
          >
            {copied ? <Check size={13} className="text-[var(--ok)]" /> : <Copy size={13} />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`rounded px-2 py-0.5 ${filter === "pending" ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
          >
            Pendientes
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded px-2 py-0.5 ${filter === "all" ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
          >
            Todas
          </button>
          {appliedCount > 0 && (
            <button
              type="button"
              onClick={clearApplied}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-muted hover:text-text"
              title="Eliminar notas aplicadas/descartadas"
            >
              <Eraser size={12} /> Limpiar
            </button>
          )}
        </div>

        {notes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2 py-4 text-center text-[11px] leading-relaxed text-muted">
            Pulsa <kbd className="rounded bg-panel-2 px-1">N</kbd> mientras ves el vídeo para anotar
            una edición en ese instante. Mantén <kbd className="rounded bg-panel-2 px-1">V</kbd> para
            dictarla por voz. Luego «Copiar» y pégaselas al asistente, o pídele «aplica mis notas».
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {notes.map((m) => {
              const status = m.status ?? "pending";
              const editing = editingId === m.id;
              return (
                <li
                  key={m.id}
                  className="rounded-md border border-border bg-panel-2 p-2 text-xs"
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrentFrame(m.frame)}
                      className="rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] text-[var(--info)] hover:opacity-80"
                      title="Ir a este punto"
                    >
                      {timecode(m.frame, fps)}
                      {m.frameEnd != null ? `–${timecode(m.frameEnd, fps)}` : ""}
                    </button>
                    {m.source === "voice" && <Mic size={11} className="text-muted" />}
                    <span
                      className={`ml-auto rounded px-1.5 py-0.5 text-[9px] ${STATUS_STYLE[status]}`}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  </div>

                  {editing ? (
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          commitEdit();
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      rows={2}
                      className="w-full resize-none rounded border border-border bg-bg px-1.5 py-1 text-xs text-text outline-none focus:border-accent"
                    />
                  ) : (
                    <p
                      onClick={() => startEdit(m)}
                      className="cursor-text whitespace-pre-wrap leading-snug text-text"
                      title="Clic para editar"
                    >
                      {m.note || <span className="text-muted">(vacía — clic para editar)</span>}
                    </p>
                  )}

                  <div className="mt-1.5 flex items-center gap-1">
                    {status !== "applied" && (
                      <button
                        type="button"
                        onClick={() => resolveNote(m.id, "applied")}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--ok)] hover:bg-emerald-500/10"
                        title="Marcar como aplicada"
                      >
                        <Check size={12} /> Aplicada
                      </button>
                    )}
                    {status !== "dismissed" && status !== "applied" && (
                      <button
                        type="button"
                        onClick={() => resolveNote(m.id, "dismissed")}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-zinc-500/10"
                        title="Descartar"
                      >
                        <X size={12} /> Descartar
                      </button>
                    )}
                    {status !== "pending" && (
                      <button
                        type="button"
                        onClick={() => resolveNote(m.id, "pending")}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--info)] hover:bg-sky-500/10"
                        title="Reabrir"
                      >
                        <RotateCcw size={12} /> Reabrir
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeNote(m.id)}
                      className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                      title="Borrar nota"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
