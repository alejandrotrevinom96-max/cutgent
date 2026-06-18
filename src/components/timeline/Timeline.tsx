"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, ZoomIn, ZoomOut, Bookmark } from "lucide-react";
import { useEditor } from "@/lib/store";
import { createTrack, newId } from "@/lib/factory";
import { Ruler } from "./Ruler";
import {
  TrackHeader,
  TrackLane,
  HEADER_WIDTH,
  TRACK_HEIGHT,
} from "./TrackRow";

/** Margen extra de frames para poder arrastrar clips más allá del final. */
const EXTRA_FRAMES = 120;

export function Timeline() {
  const document = useEditor((s) => s.document);
  const pixelsPerFrame = useEditor((s) => s.pixelsPerFrame);
  const currentFrame = useEditor((s) => s.currentFrame);
  const setCurrentFrame = useEditor((s) => s.setCurrentFrame);
  const setPixelsPerFrame = useEditor((s) => s.setPixelsPerFrame);
  const runCommand = useEditor((s) => s.runCommand);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Las pistas se pintan de arriba (última) hacia abajo (primera), como en
  // editores pro: tracks[0] es la capa inferior, así que va abajo del todo.
  const tracksTopToBottom = useMemo(
    () => [...document.tracks].reverse(),
    [document.tracks],
  );

  // Ancho del lienzo temporal: cubre la duración del proyecto y el clip más
  // largo, con margen para arrastrar.
  const contentFrames = useMemo(() => {
    let max = document.durationInFrames;
    for (const t of document.tracks) {
      for (const c of t.clips) max = Math.max(max, c.start + c.duration);
    }
    return max + EXTRA_FRAMES;
  }, [document.durationInFrames, document.tracks]);

  const contentWidth = contentFrames * pixelsPerFrame;
  const playheadX = currentFrame * pixelsPerFrame;

  // --- Virtualización: solo renderizamos lo visible (clave para 10 min) ---
  const [view, setView] = useState({ left: 0, width: 0 });
  const rafRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (el) setView({ left: el.scrollLeft, width: el.clientWidth });
  }, []);

  const onScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    measure();
    // Re-medir tras el layout (clientWidth puede ser 0 en el primer render).
    const raf = requestAnimationFrame(measure);
    const el = scrollRef.current;
    if (!el) return () => cancelAnimationFrame(raf);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [measure]);

  // Ventana visible en frames (virtualización). SIEMPRE virtualizamos: si aún
  // no se midió el ancho, usamos un valor por defecto razonable en vez de
  // renderizar todos los clips (que mataba el rendimiento en proyectos largos).
  const BUFFER_PX = 600;
  const effWidth = view.width > 0 ? view.width : 1400;
  const viewFromFrame = Math.max(0, (view.left - BUFFER_PX) / pixelsPerFrame);
  const viewToFrame = (view.left + effWidth + BUFFER_PX) / pixelsPerFrame;

  const addTrack = useCallback(() => {
    void runCommand({ type: "add_track", track: createTrack({ name: "Nueva pista" }) });
  }, [runCommand]);

  const addMarker = useCallback(() => {
    void runCommand({
      type: "add_marker",
      marker: {
        id: newId("mk"),
        frame: currentFrame,
        label: "",
        color: "#f59e0b",
        kind: "chapter",
        status: "pending",
        source: "text",
      },
    });
  }, [runCommand, currentFrame]);

  const zoomIn = useCallback(
    () => setPixelsPerFrame(pixelsPerFrame * 1.4),
    [pixelsPerFrame, setPixelsPerFrame],
  );
  const zoomOut = useCallback(
    () => setPixelsPerFrame(pixelsPerFrame / 1.4),
    [pixelsPerFrame, setPixelsPerFrame],
  );

  // Click en una zona vacía del área de pistas mueve el playhead.
  const onLanesPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
      setCurrentFrame(x / pixelsPerFrame);
    },
    [pixelsPerFrame, setCurrentFrame],
  );

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      {/* Barra de herramientas */}
      <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2">
        <button
          type="button"
          onClick={addTrack}
          className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-2"
          title="Añadir pista"
        >
          <Plus size={14} /> Pista
        </button>
        <button
          type="button"
          onClick={addMarker}
          className="flex items-center gap-1 rounded-md border border-border bg-panel-2 px-2.5 py-1 text-xs text-muted hover:text-text"
          title="Añadir marcador en el playhead (M)"
        >
          <Bookmark size={14} /> Marcador
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={zoomOut}
            className="rounded-md border border-border bg-panel-2 p-1 text-muted hover:text-text"
            title="Alejar"
          >
            <ZoomOut size={14} />
          </button>
          <input
            type="range"
            min={0.5}
            max={40}
            step={0.5}
            value={pixelsPerFrame}
            onChange={(e) => setPixelsPerFrame(Number(e.target.value))}
            className="w-28"
            title="Zoom"
          />
          <button
            type="button"
            onClick={zoomIn}
            className="rounded-md border border-border bg-panel-2 p-1 text-muted hover:text-text"
            title="Acercar"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      {/* Cuerpo: cabeceras fijas a la izquierda + área desplazable a la derecha */}
      <div className="flex min-h-0 flex-1">
        {/* Columna de cabeceras */}
        <div
          className="flex shrink-0 flex-col overflow-hidden"
          style={{ width: HEADER_WIDTH }}
        >
          {/* Espaciador alineado con la regla */}
          <div
            className="shrink-0 border-b border-r border-border bg-panel"
            style={{ height: 28 }}
          />
          <div className="flex flex-col overflow-y-hidden">
            {tracksTopToBottom.map((track) => (
              <TrackHeader key={track.id} track={track} />
            ))}
            {document.tracks.length === 0 && (
              <div className="border-r border-border p-3 text-xs text-muted">
                Sin pistas
              </div>
            )}
          </div>
        </div>

        {/* Área de pistas con scroll horizontal */}
        <div
          ref={scrollRef}
          onPointerDown={onLanesPointerDown}
          onScroll={onScroll}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
        >
          <div className="relative" style={{ width: contentWidth }}>
            <Ruler width={contentWidth} viewFromFrame={viewFromFrame} viewToFrame={viewToFrame} />

            {tracksTopToBottom.map((track) => (
              <TrackLane
                key={track.id}
                track={track}
                width={contentWidth}
                viewFromFrame={viewFromFrame}
                viewToFrame={viewToFrame}
              />
            ))}

            {document.tracks.length === 0 && (
              <div
                className="flex items-center justify-center text-xs text-muted"
                style={{ height: TRACK_HEIGHT }}
              >
                Añade una pista para empezar
              </div>
            )}

            {/* Playhead: cruza la regla y todas las pistas */}
            <div
              className="pointer-events-none absolute top-0 z-10 w-px bg-[var(--danger)]"
              style={{ left: playheadX, bottom: 0 }}
            >
              <div className="absolute -left-[5px] top-0 h-2.5 w-2.5 -translate-y-px rotate-45 bg-[var(--danger)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
