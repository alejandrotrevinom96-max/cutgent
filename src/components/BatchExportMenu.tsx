"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Loader2, ExternalLink, Download } from "lucide-react";
import { MenuPortal } from "./ui/MenuPortal";
import { SOCIAL_PRESETS } from "@/lib/export-formats";

type Item = { jobId: string; label: string; status: string; progress: number; url?: string; error?: string };
type BatchState = { id: string; status: string; done: number; total: number; items: Item[] };

/**
 * Export por lotes: elige varios presets y expórtalos de una. Estado LOCAL +
 * polling (no toca el store). El render real corre en serie en el server.
 */
export function BatchExportMenu({ disabled }: { disabled?: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failsRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(["yt-1080p", "shorts"]));
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [jobMap, setJobMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const running = !!batch && (batch.status === "queued" || batch.status === "running");

  const start = async () => {
    if (selected.size === 0) return;
    setError("");
    const presetIds = [...selected];
    try {
      const r = await fetch("/api/render/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetIds }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        setError(e.error || "No se pudo iniciar el lote.");
        return;
      }
      const { batchId, jobIds } = (await r.json()) as { batchId: string; jobIds: string[] };
      // jobIds viene en el MISMO orden que presetIds → mapa estable por id.
      const map: Record<string, string> = {};
      presetIds.forEach((id, i) => { if (jobIds[i]) map[id] = jobIds[i]; });
      setJobMap(map);
      if (pollRef.current) clearInterval(pollRef.current);
      failsRef.current = 0;
      pollRef.current = setInterval(async () => {
        const s = (await fetch(`/api/render/batch/status?id=${batchId}`).then((x) => x.json()).catch(() => null)) as BatchState | null;
        if (!s || !s.items) {
          // Aborta tras varios fallos seguidos (no dejar el intervalo girando).
          if (++failsRef.current >= 5 && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setError("Se perdió la conexión con el render.");
          }
          return;
        }
        failsRef.current = 0;
        setBatch(s);
        if (s.status !== "queued" && s.status !== "running" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 900);
    } catch {
      setError("No se pudo iniciar el lote.");
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Exportar a varios formatos de una"
        className="flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-muted transition-colors hover:text-text disabled:opacity-60"
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
        <span className="hidden md:inline">Varios{running ? ` ${batch!.done}/${batch!.total}` : ""}</span>
      </button>
      <MenuPortal anchorRef={btnRef} open={open} onClose={() => setOpen(false)} align="right" width={300}>
        <div className="p-2">
          <p className="mb-1.5 px-1 text-[11px] font-semibold text-text">Exportar varios formatos</p>
          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {SOCIAL_PRESETS.map((p) => {
              const item = batch?.items.find((i) => i.jobId === jobMap[p.id]);
              return (
                <label key={p.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-muted hover:bg-panel">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} disabled={running} className="accent-[var(--accent)]" />
                  <span className="flex-1 text-text">{p.label}</span>
                  {item && (item.status === "done" && item.url ? (
                    <span className="flex items-center gap-1">
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}><ExternalLink size={12} /></a>
                      <a href={item.url} download className="text-muted hover:text-text" onClick={(e) => e.stopPropagation()}><Download size={12} /></a>
                    </span>
                  ) : item.status === "error" ? (
                    <span className="text-[10px] text-[var(--danger,#ef4444)]">error</span>
                  ) : (
                    <span className="font-mono text-[10px] text-muted">{Math.round(item.progress * 100)}%</span>
                  ))}
                </label>
              );
            })}
          </div>
          {error && <p className="mt-1 px-1 text-[11px] text-[var(--danger,#ef4444)]">{error}</p>}
          <p className="mt-1 px-1 text-[10px] leading-tight text-muted">
            Cada formato es un render completo (tarda ~N×). Los de otra resolución no recolocan clips.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={running || selected.size === 0}
            className="mt-1.5 w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-2 disabled:opacity-40"
          >
            {running ? `Exportando ${batch!.done}/${batch!.total}…` : `Exportar ${selected.size}`}
          </button>
        </div>
      </MenuPortal>
    </>
  );
}
