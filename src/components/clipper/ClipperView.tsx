"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Scissors,
  Upload,
  Captions,
  Play,
  Plus,
  FolderOpen,
  Loader2,
  Film,
  Flag,
  FlagOff,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { createClip, createTrack, newId } from "@/lib/factory";
import type { Asset, Project, Track } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Tipos locales de las respuestas HTTP (contrato fijo de la API)
// ---------------------------------------------------------------------------

interface TranscriptSegment {
  start: number; // segundos
  end: number; // segundos
  text: string;
}

interface Transcript {
  src: string;
  language: string;
  durationSec: number;
  model: string;
  segments: TranscriptSegment[];
}

interface TranscribeRunning {
  status: "running";
  jobId: string;
}

interface TranscribeDone {
  status: "done";
  transcript: Transcript;
}

interface TranscribeError {
  status: "error";
  error?: string;
}

interface TranscribeNeedsLang {
  status: "needs_language";
  detection?: { language?: string; top?: { language: string; prob: number }[] };
}

type TranscribePostResponse = TranscribeRunning | TranscribeDone | TranscribeNeedsLang;
type TranscribeJobResponse = TranscribeRunning | TranscribeDone | TranscribeError;

interface TranscribeCacheResponse {
  transcript: Transcript;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const FPS = 30;
const CLIP_WIDTH = 1080;
const CLIP_HEIGHT = 1920;
const POLL_MS = 2500;

/** Formatea segundos a mm:ss. */
function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Vista principal del Clipper
// ---------------------------------------------------------------------------

export function ClipperView() {
  const assets = useEditor((s) => s.assets);
  const projects = useEditor((s) => s.projects);
  const refreshAssets = useEditor((s) => s.refreshAssets);
  const refreshProjects = useEditor((s) => s.refreshProjects);
  const openProject = useEditor((s) => s.openProject);
  const setView = useEditor((s) => s.setView);

  const videoAssets = useMemo(() => assets.filter((a) => a.kind === "video"), [assets]);

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const selectedAsset = useMemo(
    () => videoAssets.find((a) => a.id === selectedAssetId) ?? null,
    [videoAssets, selectedAssetId],
  );

  const [uploading, setUploading] = useState(false);

  // Transcript
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeElapsed, setTranscribeElapsed] = useState(0);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Cronómetro de transcripción: muestra que sigue trabajando (Whisper en un
  // video largo tarda minutos; sin esto el usuario cree que se colgó).
  useEffect(() => {
    if (!transcribing) return;
    setTranscribeElapsed(0);
    const t = setInterval(() => setTranscribeElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [transcribing]);

  // Rango marcado para clip manual (en segundos)
  const [rangeStart, setRangeStart] = useState<number>(0);
  const [rangeEnd, setRangeEnd] = useState<number>(0);

  // Título del clip a crear
  const [clipTitle, setClipTitle] = useState<string>("");

  // Creación de clip
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Limpia el polling al desmontar.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Carga inicial de assets y proyectos.
  useEffect(() => {
    void refreshAssets();
    void refreshProjects();
  }, [refreshAssets, refreshProjects]);

  // Selecciona automáticamente el primer video si no hay nada seleccionado.
  useEffect(() => {
    if (!selectedAssetId && videoAssets.length > 0) {
      setSelectedAssetId(videoAssets[0]!.id);
    }
  }, [videoAssets, selectedAssetId]);

  // Detiene cualquier polling en curso.
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Al cambiar de fuente: resetea estado y busca transcript cacheado.
  useEffect(() => {
    stopPolling();
    setTranscript(null);
    setTranscribeError(null);
    setTranscribing(false);
    setRangeStart(0);
    setRangeEnd(0);
    setClipTitle("");
    setCreateError(null);

    if (!selectedAsset) return;

    let cancelled = false;
    const src = selectedAsset.src;
    void (async () => {
      try {
        const res = await fetch(`/api/transcribe?src=${encodeURIComponent(src)}`);
        if (!res.ok) return; // 404: no hay caché todavía
        const data = (await res.json()) as TranscribeCacheResponse;
        if (!cancelled && data && data.transcript) {
          setTranscript(data.transcript);
        }
      } catch {
        /* sin caché: el usuario puede transcribir manualmente */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedAsset, stopPolling]);

  // -------------------------------------------------------------------------
  // Subida de video
  // -------------------------------------------------------------------------

  const handleUpload = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/assets/upload", { method: "POST", body: form });
        if (res.ok) {
          const asset = (await res.json()) as Asset;
          await refreshAssets();
          if (asset && asset.id) setSelectedAssetId(asset.id);
        }
      } catch {
        /* fallo de subida */
      } finally {
        setUploading(false);
      }
    },
    [refreshAssets],
  );

  // -------------------------------------------------------------------------
  // Transcripción
  // -------------------------------------------------------------------------

  const pollJob = useCallback(
    (jobId: string) => {
      stopPolling();
      pollRef.current = setInterval(() => {
        void (async () => {
          try {
            const res = await fetch(`/api/transcribe?id=${encodeURIComponent(jobId)}`);
            const data = (await res.json()) as TranscribeJobResponse;
            if (data.status === "done") {
              stopPolling();
              setTranscript(data.transcript);
              setTranscribing(false);
            } else if (data.status === "error") {
              stopPolling();
              setTranscribeError(data.error ?? "Error al transcribir.");
              setTranscribing(false);
            }
            // "running": seguimos esperando
          } catch {
            stopPolling();
            setTranscribeError("Error de red durante la transcripción.");
            setTranscribing(false);
          }
        })();
      }, POLL_MS);
    },
    [stopPolling],
  );

  const handleTranscribe = useCallback(
    async (language?: string) => {
      if (!selectedAsset || transcribing) return;
      setTranscribing(true);
      setTranscribeError(null);
      setTranscript(null);
      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ src: selectedAsset.src, ...(language ? { language } : {}) }),
        });
        const data = (await res.json()) as TranscribePostResponse;
        if (data.status === "done") {
          setTranscript(data.transcript);
          setTranscribing(false);
        } else if (data.status === "running") {
          pollJob(data.jobId);
        } else if (data.status === "needs_language") {
          // Idioma no detectado con confianza: reintenta con el mejor candidato
          // e informa (evita el spinner infinito). El dueño puede re-transcribir
          // forzando el idioma desde el asistente si fuera otro.
          const guess = data.detection?.language || data.detection?.top?.[0]?.language;
          if (guess && !language) {
            setTranscribeError(`Idioma no seguro; usando "${guess}". Si no es correcto, vuelve a intentarlo.`);
            setTranscribing(false);
            void handleTranscribe(guess);
          } else {
            setTranscribeError("No se pudo detectar el idioma del audio.");
            setTranscribing(false);
          }
        }
      } catch {
        setTranscribeError("No se pudo iniciar la transcripción.");
        setTranscribing(false);
      }
    },
    [selectedAsset, transcribing, pollJob],
  );

  // -------------------------------------------------------------------------
  // Reproductor: seek
  // -------------------------------------------------------------------------

  const seekTo = useCallback((sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, sec);
    void v.play().catch(() => {
      /* algunos navegadores requieren interacción; ignoramos */
    });
  }, []);

  const markStart = useCallback(() => {
    const v = videoRef.current;
    const t = v ? v.currentTime : 0;
    setRangeStart(Math.max(0, t));
    if (t > rangeEnd) setRangeEnd(t);
  }, [rangeEnd]);

  const markEnd = useCallback(() => {
    const v = videoRef.current;
    const t = v ? v.currentTime : 0;
    setRangeEnd(Math.max(0, t));
  }, []);

  // -------------------------------------------------------------------------
  // Clips de esta fuente
  // -------------------------------------------------------------------------

  const clipsOfSource = useMemo(() => {
    if (!selectedAsset) return [];
    return projects.filter((p) => p.kind === "clip" && p.sourceId === selectedAsset.id);
  }, [projects, selectedAsset]);

  // -------------------------------------------------------------------------
  // Crear clip del rango marcado
  // -------------------------------------------------------------------------

  const rangeValid = selectedAsset !== null && rangeEnd > rangeStart;

  const handleCreateClip = useCallback(async () => {
    if (!selectedAsset || !rangeValid || creating) return;
    setCreating(true);
    setCreateError(null);

    const inicio = rangeStart;
    const fin = rangeEnd;
    const durationInFrames = Math.round((fin - inicio) * FPS);
    if (durationInFrames < 1) {
      setCreateError("El rango es demasiado corto.");
      setCreating(false);
      return;
    }

    const name = clipTitle.trim() || "Clip";

    // Pista de video con el recorte de la fuente.
    const videoTrack: Track = createTrack({ name: "Video", kind: "media" });
    videoTrack.clips.push(
      createClip("video", {
        src: selectedAsset.src,
        name,
        start: 0,
        duration: durationInFrames,
        trimStart: Math.round(inicio * FPS),
        fit: "cover",
        width: CLIP_WIDTH,
        height: CLIP_HEIGHT,
      }),
    );

    const tracks: Track[] = [videoTrack];

    // Pista de subtítulos a partir de los segmentos que solapan el rango.
    if (transcript && transcript.segments.length > 0) {
      const overlapping = transcript.segments.filter(
        (seg) => seg.end > inicio && seg.start < fin,
      );
      if (overlapping.length > 0) {
        const subTrack: Track = createTrack({ name: "Subtítulos", kind: "media" });
        for (const seg of overlapping) {
          // Recorta el segmento al rango y lo expresa en frames relativos al clip.
          const segStart = Math.max(seg.start, inicio);
          const segEnd = Math.min(seg.end, fin);
          const startFrame = Math.round((segStart - inicio) * FPS);
          const durFrames = Math.max(1, Math.round((segEnd - segStart) * FPS));
          subTrack.clips.push(
            createClip("text", {
              name: "Subtítulo",
              text: seg.text.trim(),
              start: startFrame,
              duration: durFrames,
              fontSize: 64,
              fontWeight: 800,
              color: "#fff",
              strokeColor: "#000",
              strokeWidth: 8,
              textAlign: "center",
              width: CLIP_WIDTH,
              y: Math.round(CLIP_HEIGHT / 2 - 240),
            }),
          );
        }
        tracks.push(subTrack);
      }
    }

    const document: Project = {
      version: 1,
      id: newId("proj"),
      name,
      width: CLIP_WIDTH,
      height: CLIP_HEIGHT,
      fps: FPS,
      durationInFrames,
      backgroundColor: "#000",
      tracks,
      markers: [],
    };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          kind: "clip",
          sourceId: selectedAsset.id,
          document,
        }),
      });
      if (!res.ok) {
        setCreateError("No se pudo crear el clip. Inténtalo de nuevo.");
        return;
      }
      await refreshProjects();
      setClipTitle("");
    } catch {
      setCreateError("Error de red al crear el clip.");
    } finally {
      setCreating(false);
    }
  }, [selectedAsset, rangeValid, creating, rangeStart, rangeEnd, clipTitle, transcript, refreshProjects]);

  const handleOpenClip = useCallback(
    async (id: string) => {
      await openProject(id);
      setView("editor");
    },
    [openProject, setView],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-text">
      {/* ================================================================= */}
      {/* A) Columna izquierda — Fuente                                      */}
      {/* ================================================================= */}
      <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-r border-border bg-panel">
        <header className="flex items-center gap-2 border-b border-border p-3">
          <Scissors size={18} className="text-accent" />
          <h2 className="text-sm font-semibold">Fuente</h2>
        </header>

        <Section title="Video fuente">
          {videoAssets.length === 0 ? (
            <p className="text-xs text-muted">
              No hay videos todavía. Sube uno para empezar.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {videoAssets.map((asset) => {
                const active = asset.id === selectedAssetId;
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`flex w-full items-center gap-2 rounded-md border p-2 text-left transition ${
                        active
                          ? "border-accent bg-panel-2"
                          : "border-border bg-panel-2 hover:border-accent"
                      }`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-track text-muted">
                        {asset.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={asset.thumbnail}
                            alt={asset.name}
                            className="h-9 w-9 rounded object-cover"
                          />
                        ) : (
                          <Film size={16} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs">{asset.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-panel-2 px-3 py-2.5 text-xs text-muted transition hover:border-accent hover:text-text">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            <span>{uploading ? "Subiendo…" : "Subir video"}</span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                void handleUpload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Section>

        <Section title="Reproductor">
          {selectedAsset ? (
            <video
              ref={videoRef}
              key={selectedAsset.id}
              controls
              src={selectedAsset.src}
              className="w-full rounded-md border border-border bg-black"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-md border border-border bg-black/50 text-muted">
              <Film size={28} />
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            El asistente (Claude) también puede traer videos y elegir clips por{" "}
            <span className="text-text">MCP</span>.
          </p>
        </Section>
      </aside>

      {/* ================================================================= */}
      {/* B) Centro — Transcript                                             */}
      {/* ================================================================= */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-border bg-panel p-3">
          <div className="flex items-center gap-2">
            <Captions size={18} className="text-accent" />
            <h2 className="text-sm font-semibold">Transcripción</h2>
          </div>
          <button
            type="button"
            onClick={() => void handleTranscribe()}
            disabled={!selectedAsset || transcribing}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {transcribing ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Transcribiendo…
              </>
            ) : (
              <>
                <Captions size={14} /> Transcribir
              </>
            )}
          </button>
        </header>

        {/* Selección de rango para clip manual */}
        <div className="flex flex-col gap-2 border-b border-border bg-panel-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={markStart}
              disabled={!selectedAsset}
              className="flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Flag size={14} className="text-accent" /> Marcar inicio aquí
            </button>
            <button
              type="button"
              onClick={markEnd}
              disabled={!selectedAsset}
              className="flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FlagOff size={14} className="text-accent" /> Marcar fin aquí
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <label className="flex items-center gap-1.5">
              Inicio (s)
              <input
                type="number"
                min={0}
                step={0.1}
                value={Number(rangeStart.toFixed(2))}
                onChange={(e) => setRangeStart(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 rounded-md border border-border bg-panel px-2 py-1 text-text outline-none focus:border-accent"
              />
            </label>
            <label className="flex items-center gap-1.5">
              Fin (s)
              <input
                type="number"
                min={0}
                step={0.1}
                value={Number(rangeEnd.toFixed(2))}
                onChange={(e) => setRangeEnd(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 rounded-md border border-border bg-panel px-2 py-1 text-text outline-none focus:border-accent"
              />
            </label>
            <span className="text-text">
              Rango: {fmt(rangeStart)} – {fmt(rangeEnd)}{" "}
              {rangeValid ? (
                <span className="text-muted">({(rangeEnd - rangeStart).toFixed(1)} s)</span>
              ) : (
                <span className="text-[var(--danger,#ef4444)]">(marca un rango válido)</span>
              )}
            </span>
          </div>
        </div>

        {/* Lista de segmentos */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!selectedAsset ? (
            <p className="text-xs text-muted">Selecciona un video fuente para ver su transcripción.</p>
          ) : transcribeError ? (
            <p className="text-xs text-[var(--danger,#ef4444)]">{transcribeError}</p>
          ) : transcribing ? (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 size={14} className="animate-spin" /> Transcribiendo… (modelo local) ·{" "}
              <span className="font-mono tabular-nums">{fmt(transcribeElapsed)}</span>
            </p>
          ) : transcript && transcript.segments.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {transcript.segments.map((seg, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => seekTo(seg.start)}
                    className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-panel-2"
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-[11px] text-accent-2">
                      [{fmt(seg.start)}]
                    </span>
                    <span className="min-w-0 flex-1 text-xs leading-relaxed text-text">
                      {seg.text}
                    </span>
                    <Play
                      size={12}
                      className="mt-0.5 shrink-0 text-muted opacity-0 transition group-hover:opacity-100"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">
              Aún no hay transcripción. Pulsa{" "}
              <span className="text-text">Transcribir</span> para generarla localmente.
            </p>
          )}
        </div>
      </main>

      {/* ================================================================= */}
      {/* C) Columna derecha — Clips                                         */}
      {/* ================================================================= */}
      <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-border bg-panel">
        <header className="flex items-center gap-2 border-b border-border p-3">
          <Film size={18} className="text-accent" />
          <h2 className="text-sm font-semibold">Clips</h2>
        </header>

        <Section title="Crear clip del rango">
          <input
            type="text"
            placeholder="Título del clip (opcional)"
            value={clipTitle}
            onChange={(e) => setClipTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void handleCreateClip()}
            disabled={!rangeValid || creating}
            className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Creando…
              </>
            ) : (
              <>
                <Plus size={14} /> Crear clip del rango
              </>
            )}
          </button>
          <p className="text-[11px] leading-relaxed text-muted">
            Genera un clip vertical (1080×1920) del rango marcado, con subtítulos
            automáticos si hay transcripción.
          </p>
          {createError && (
            <p className="text-xs text-[var(--danger,#ef4444)]">{createError}</p>
          )}
        </Section>

        <Section title="Clips de esta fuente">
          {!selectedAsset ? (
            <p className="text-xs text-muted">Selecciona un video fuente.</p>
          ) : clipsOfSource.length === 0 ? (
            <p className="text-xs text-muted">
              Aún no hay clips. Marca un rango y créalo, o pídeselo a Claude.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {clipsOfSource.map((p) => (
                <li key={p.id}>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-panel-2 p-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-track text-accent">
                      <Scissors size={14} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">{p.name}</span>
                    <button
                      type="button"
                      onClick={() => void handleOpenClip(p.id)}
                      title="Abrir en el editor"
                      className="flex shrink-0 items-center gap-1 rounded-md bg-panel px-2 py-1 text-[11px] text-muted transition hover:bg-accent hover:text-white"
                    >
                      <FolderOpen size={12} /> Abrir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-border p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}
