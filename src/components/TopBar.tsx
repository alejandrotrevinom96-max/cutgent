"use client";

import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Download,
  Loader2,
  Settings2,
  ExternalLink,
  Undo2,
  Redo2,
  FolderOpen,
  ChevronDown,
  Plus,
  Trash2,
  Scissors,
  Image as ImageIcon,
  KeyRound,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { EXPORT_FORMATS, type ExportFormat } from "@/lib/export-formats";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { MenuPortal } from "./ui/MenuPortal";
import { SettingsModal } from "./SettingsModal";

/**
 * Barra superior fija: nombre del proyecto editable, ajustes de composición
 * (resolución, fps, duración) en un popover, y exportación a MP4 con polling
 * del estado de render apoyado en el store.
 */
export function TopBar() {
  const document = useEditor((s) => s.document);
  const runCommand = useEditor((s) => s.runCommand);
  const render = useEditor((s) => s.render);
  const setRender = useEditor((s) => s.setRender);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("h264");
  const [exportQuality, setExportQuality] = useState<"high" | "balanced" | "fast">("balanced");
  const [exportGpu, setExportGpu] = useState(false);
  const [formatMenu, setFormatMenu] = useState(false);
  const [poster, setPoster] = useState<{ loading: boolean; url?: string; error?: string }>({
    loading: false,
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  // Limpia el polling al desmontar.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const setName = (name: string) => {
    void runCommand({ type: "set_project_settings", patch: { name } });
  };

  const exportRender = async (format: ExportFormat) => {
    if (render.status === "rendering") return;
    setExportFormat(format);
    setFormatMenu(false);
    setRender({ status: "rendering", progress: 0, url: undefined, error: undefined });

    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, quality: exportQuality, gpu: exportGpu }),
      });
      if (!res.ok) throw new Error(`No se pudo iniciar el render (${res.status}).`);
      const { jobId } = (await res.json()) as { jobId: string };

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        void pollStatus(jobId);
      }, 800);
    } catch (err) {
      setRender({ status: "error", error: errorMessage(err) });
    }
  };

  const exportPoster = async () => {
    if (poster.loading) return;
    setPoster({ loading: true });
    try {
      const res = await fetch("/api/render/still", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame: useEditor.getState().currentFrame }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error generando el poster.");
      setPoster({ loading: false, url: data.url });
    } catch (err) {
      setPoster({ loading: false, error: errorMessage(err) });
    }
  };

  const pollStatus = async (jobId: string) => {
    try {
      const res = await fetch(`/api/render/status?id=${encodeURIComponent(jobId)}`);
      if (!res.ok) throw new Error(`Error consultando el estado (${res.status}).`);
      const data = (await res.json()) as {
        status: "idle" | "rendering" | "done" | "error";
        progress: number;
        url?: string;
        error?: string;
        etaSec?: number;
      };

      if (data.status === "done") {
        if (pollRef.current) clearInterval(pollRef.current);
        setEta(null);
        setRender({ status: "done", progress: 1, url: data.url });
      } else if (data.status === "error") {
        if (pollRef.current) clearInterval(pollRef.current);
        setEta(null);
        setRender({ status: "error", error: data.error ?? "Error de render." });
      } else {
        setEta(typeof data.etaSec === "number" ? data.etaSec : null);
        setRender({ status: "rendering", progress: data.progress ?? 0 });
      }
    } catch (err) {
      if (pollRef.current) clearInterval(pollRef.current);
      setRender({ status: "error", error: errorMessage(err) });
    }
  };

  const rendering = render.status === "rendering";

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3 overflow-hidden border-b border-border bg-panel px-4">
      {/* Izquierda: logo + nombre del proyecto */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2 text-accent">
          <Clapperboard size={20} />
          <span className="text-sm font-semibold tracking-tight text-text">Claudit</span>
        </div>
        <input
          value={document.name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre del proyecto"
          className="w-36 min-w-0 shrink truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-text outline-none transition-colors hover:border-border focus:border-accent focus:bg-panel-2"
        />
        {/* Deshacer / rehacer */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!canUndo}
            title="Deshacer (Ctrl+Z)"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-panel-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => void redo()}
            disabled={!canRedo}
            title="Rehacer (Ctrl+Shift+Z)"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-panel-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Redo2 size={16} />
          </button>
        </div>
        <ProjectSwitcher />

        {/* Toggle Editor | Clipper */}
        <div className="flex items-center rounded-md border border-border bg-panel-2 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setView("editor")}
            className={`rounded px-2.5 py-1 transition-colors ${view === "editor" ? "bg-accent text-white" : "text-muted hover:text-text"}`}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => setView("clipper")}
            className={`flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${view === "clipper" ? "bg-accent text-white" : "text-muted hover:text-text"}`}
          >
            <Scissors size={12} /> Clipper
          </button>
        </div>
      </div>

      {/* Centro: ajustes de composición */}
      <div className="mx-auto flex min-w-0 items-center gap-2">
        <button
          ref={settingsBtnRef}
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition-colors hover:text-text"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
        >
          <Settings2 size={14} />
          <span className="font-mono tabular-nums">
            {document.width}×{document.height}
          </span>
          <span className="text-border">·</span>
          <span className="font-mono tabular-nums">{document.fps} fps</span>
        </button>

        <MenuPortal
          anchorRef={settingsBtnRef}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          align="left"
          width={264}
        >
          <SettingsPopover onClose={() => setSettingsOpen(false)} />
        </MenuPortal>

        <ThemeSwitcher />

        <button
          type="button"
          onClick={() => setKeysOpen(true)}
          title="Ajustes (API keys)"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-muted transition-colors hover:text-text"
        >
          <KeyRound size={14} />
          <span className="hidden md:inline">Ajustes</span>
        </button>
      </div>
      <SettingsModal open={keysOpen} onClose={() => setKeysOpen(false)} />

      {/* Derecha: exportar MP4 */}
      <div className="flex shrink-0 items-center gap-2">
        {rendering && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${Math.round(render.progress * 100)}%` }}
              />
            </div>
            <span className="w-9 text-right font-mono text-xs tabular-nums text-muted">
              {Math.round(render.progress * 100)}%
            </span>
            {eta != null && eta > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-muted" title="Tiempo restante estimado">
                ~{Math.floor(eta / 60)}:{String(eta % 60).padStart(2, "0")}
              </span>
            )}
          </div>
        )}

        {render.status === "done" && render.url && (
          <div className="flex items-center gap-2 text-xs">
            <a
              href={render.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-accent hover:underline"
            >
              <ExternalLink size={14} />
              Abrir
            </a>
            <a
              href={render.url}
              download
              className="flex items-center gap-1 text-muted hover:text-text"
            >
              <Download size={14} />
              Descargar
            </a>
          </div>
        )}

        {render.status === "error" && (
          <span className="max-w-[200px] truncate text-xs text-[var(--danger)]" title={render.error}>
            {render.error ?? "Error de render."}
          </span>
        )}

        {/* Poster / miniatura del frame actual */}
        <button
          type="button"
          onClick={exportPoster}
          disabled={poster.loading}
          title="Exportar miniatura del frame actual"
          className="flex items-center gap-1 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-muted transition-colors hover:text-text disabled:opacity-60"
        >
          {poster.loading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
          {poster.url ? (
            <a href={poster.url} download className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
              Miniatura ↓
            </a>
          ) : (
            "Miniatura"
          )}
        </button>

        {/* Exportar: botón principal + selector de formato */}
        <div className="relative flex items-stretch">
          <button
            type="button"
            onClick={() => void exportRender(exportFormat)}
            disabled={rendering}
            className="flex items-center gap-2 rounded-l-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rendering ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {rendering ? "Renderizando…" : `Exportar ${EXPORT_FORMATS[exportFormat].label}`}
          </button>
          <button
            ref={exportBtnRef}
            type="button"
            onClick={() => setFormatMenu((v) => !v)}
            disabled={rendering}
            title="Elegir formato"
            className="flex items-center rounded-r-md border-l border-white/20 bg-accent px-1.5 text-white transition-colors hover:bg-accent-2 disabled:opacity-60"
          >
            <ChevronDown size={14} />
          </button>
          <MenuPortal
            anchorRef={exportBtnRef}
            open={formatMenu}
            onClose={() => setFormatMenu(false)}
            align="right"
            width={200}
          >
            <div className="p-1">
              {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => void exportRender(f)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                    f === exportFormat ? "bg-panel text-text" : "text-muted hover:bg-panel hover:text-text"
                  }`}
                >
                  {EXPORT_FORMATS[f].label}
                  {f === exportFormat && <span className="text-accent">✓</span>}
                </button>
              ))}

              <div className="my-1 border-t border-border" />
              <div className="px-2 py-1">
                <label className="mb-1 flex items-center justify-between text-[11px] text-muted">
                  Calidad
                  <select
                    value={exportQuality}
                    onChange={(e) => setExportQuality(e.target.value as "high" | "balanced" | "fast")}
                    className="rounded border border-border bg-panel px-1.5 py-0.5 text-[11px] text-text outline-none focus:border-accent"
                  >
                    <option value="high">Alta</option>
                    <option value="balanced">Equilibrada</option>
                    <option value="fast">Rápida</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-[11px] text-muted" title="Usa el encoder por hardware (nvenc/qsv/amf) si está disponible. Solo H.264.">
                  <input type="checkbox" checked={exportGpu} onChange={(e) => setExportGpu(e.target.checked)} />
                  Acelerar con GPU (H.264)
                </label>
              </div>
              <p className="px-2 py-1 text-[10px] leading-snug text-muted">
                ProRes/WebM pesan y tardan más. GIF no lleva audio.
              </p>
            </div>
          </MenuPortal>
        </div>
      </div>
    </header>
  );
}

/** Popover de ajustes de composición: resolución, fps y duración. */
function SettingsPopover({ onClose }: { onClose: () => void }) {
  const document = useEditor((s) => s.document);
  const runCommand = useEditor((s) => s.runCommand);

  const patch = (p: {
    width?: number;
    height?: number;
    fps?: number;
    durationInFrames?: number;
    motionBlur?: { samples: number; shutterAngle: number } | null;
  }) => {
    void runCommand({ type: "set_project_settings", patch: p });
  };

  return (
    <div role="dialog" aria-label="Ajustes de composición" className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-text">Composición</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted hover:text-text"
        >
          Cerrar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Ancho"
          value={document.width}
          min={1}
          onChange={(v) => patch({ width: v })}
        />
        <NumberField
          label="Alto"
          value={document.height}
          min={1}
          onChange={(v) => patch({ height: v })}
        />
        <NumberField
          label="FPS"
          value={document.fps}
          min={1}
          onChange={(v) => patch({ fps: v })}
        />
        <NumberField
          label="Duración (frames)"
          value={document.durationInFrames}
          min={1}
          onChange={(v) => patch({ durationInFrames: v })}
        />
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-text">
        <input
          type="checkbox"
          checked={!!document.motionBlur}
          onChange={(e) =>
            patch({ motionBlur: e.target.checked ? { samples: 10, shutterAngle: 180 } : null })
          }
        />
        Motion blur global
        <span className="ml-auto text-[10px] text-muted">opt-in (cuesta render)</span>
      </label>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, min, onChange }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(min !== undefined ? Math.max(min, n) : n);
        }}
        className="w-full rounded-md border border-border bg-panel px-2 py-1 text-sm text-text outline-none focus:border-accent"
      />
    </label>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error inesperado.";
}

/** Selector de proyecto: cambia entre proyectos (incl. clips) y crea nuevos. */
function ProjectSwitcher() {
  const projects = useEditor((s) => s.projects);
  const currentId = useEditor((s) => s.currentProjectId);
  const openProject = useEditor((s) => s.openProject);
  const createProject = useEditor((s) => s.createProject);
  const deleteProject = useEditor((s) => s.deleteProject);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = projects.find((p) => p.id === currentId);

  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      const doc = JSON.parse(await file.text());
      const meta = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${doc?.name ?? "Proyecto"} (importado)`, document: doc }),
      }).then((r) => r.json());
      if (meta?.id) await openProject(meta.id);
      setOpen(false);
    } catch {
      /* archivo inválido */
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-muted transition-colors hover:text-text"
        title="Cambiar de proyecto"
      >
        <FolderOpen size={14} />
        <span className="max-w-[120px] truncate">{current?.name ?? "Proyectos"}</span>
        <ChevronDown size={12} />
      </button>

      <MenuPortal anchorRef={btnRef} open={open} onClose={() => setOpen(false)} align="left" width={256}>
        <div className="p-1">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[11px] font-semibold text-muted">PROYECTOS</span>
              <button
                type="button"
                onClick={async () => {
                  const m = await createProject({ name: "Nuevo proyecto" });
                  if (m) await openProject(m.id);
                  setOpen(false);
                }}
                className="flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                <Plus size={12} /> Nuevo
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`group flex items-center gap-1 rounded px-2 py-1.5 text-xs ${
                    p.id === currentId ? "bg-panel text-text" : "text-muted hover:bg-panel"
                  }`}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      await openProject(p.id);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    {p.kind === "clip" && <Scissors size={11} className="shrink-0 text-accent-2" />}
                    <span className="truncate">{p.name}</span>
                  </button>
                  {projects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => deleteProject(p.id)}
                      className="text-muted opacity-0 transition-opacity hover:text-[var(--danger)] group-hover:opacity-100"
                      title="Eliminar proyecto"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-2 border-t border-border px-2 pt-1.5 text-[11px]">
              <a href="/api/projects/export" download className="flex-1 text-muted hover:text-text">
                ↓ Exportar actual
              </a>
              <label className="cursor-pointer text-muted hover:text-text">
                ↑ Importar
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    void importProject(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </MenuPortal>
    </>
  );
}
