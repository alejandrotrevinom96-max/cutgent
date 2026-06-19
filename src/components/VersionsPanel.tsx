"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Save, RotateCcw } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { SnapshotMeta } from "@/lib/server-store";

/**
 * Panel "Versiones": lista los snapshots persistentes del proyecto actual y deja
 * guardar uno manual o restaurar uno anterior. El restore se aplica vía SSE
 * (el server difunde un snapshot), así que no se toca el store aquí.
 */
function relativeTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "hace un momento";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

export function VersionsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clientId = useEditor((s) => s.clientId);
  const [items, setItems] = useState<SnapshotMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    fetch("/api/versions")
      .then((r) => r.json())
      .then((d) => setItems(d?.snapshots ?? []))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setError(e.error || "No se pudo guardar la versión.");
        return;
      }
      setLabel("");
      refresh();
    } catch {
      setError("No se pudo guardar la versión.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: string) => {
    if (!window.confirm("¿Restaurar a esta versión? Se guarda un snapshot del estado actual antes de cambiar.")) return;
    setBusy(true);
    try {
      await fetch("/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-id": clientId },
        body: JSON.stringify({ id }),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <History size={15} className="text-accent" />
        <h2 className="flex-1 text-sm font-semibold text-text">Versiones</h2>
      </div>

      <div className="mb-1.5 flex items-center gap-1.5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) void save(); }}
          placeholder="Etiqueta (opcional)"
          className="min-w-0 flex-1 rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-text outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-2 disabled:opacity-40"
        >
          <Save size={13} /> Guardar
        </button>
      </div>
      {error && <p className="mb-1.5 text-[11px] text-[var(--danger,#ef4444)]">{error}</p>}

      <p className="mb-2 text-[10px] leading-tight text-muted">
        Guardadas en tu equipo. Se crean automáticamente cada pocos minutos y al restaurar.
      </p>

      {items.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-muted">Aún no hay versiones.</p>
      ) : (
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {items.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-md border border-border bg-panel-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[11px] text-text">{s.label || "Sin etiqueta"}</span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] ${
                      s.kind === "manual" ? "bg-accent/20 text-accent" : "bg-panel text-muted"
                    }`}
                  >
                    {s.kind === "manual" ? "Manual" : "Auto"}
                  </span>
                </div>
                <span className="text-[10px] text-muted">{relativeTime(s.createdAt)}</span>
              </div>
              <button
                type="button"
                onClick={() => restore(s.id)}
                disabled={busy}
                title="Restaurar esta versión"
                className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted hover:text-text disabled:opacity-40"
              >
                <RotateCcw size={12} /> Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
