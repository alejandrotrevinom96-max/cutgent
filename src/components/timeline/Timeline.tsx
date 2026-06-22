"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, ZoomIn, ZoomOut, Bookmark, Download, X } from "lucide-react";
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

  const setSelectedClipIds = useEditor((s) => s.setSelectedClipIds);
  const selectClip = useEditor((s) => s.selectClip);

  // Rango I/O (teclas I/O). Lo consumimos: banda en la regla + "Exportar rango".
  const inFrame = useEditor((s) => s.inFrame);
  const outFrame = useEditor((s) => s.outFrame);
  const setInFrame = useEditor((s) => s.setInFrame);
  const setOutFrame = useEditor((s) => s.setOutFrame);
  const fps = useEditor((s) => s.document.fps);
  const hasRange =
    inFrame != null && outFrame != null && Math.abs(outFrame - inFrame) >= 1;

  const exportRange = useCallback(() => {
    if (!hasRange) return;
    // La barra superior tiene el flujo de render + polling; lo reusamos por evento.
    window.dispatchEvent(new Event("cutgent:export-range"));
  }, [hasRange]);

  const clearRange = useCallback(() => {
    setInFrame(null);
    setOutFrame(null);
  }, [setInFrame, setOutFrame]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Columna de cabeceras: sincronizamos su scroll vertical con el de los carriles.
  const headersRef = useRef<HTMLDivElement>(null);

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

  // Zoom preservando el frame del playhead: ajustamos scrollLeft para que el
  // frame del cursor quede en la misma posición de pantalla tras el zoom.
  const zoomKeepingPlayhead = useCallback(
    (nextPpf: number) => {
      const el = scrollRef.current;
      const clamped = Math.max(0.5, Math.min(40, nextPpf));
      if (el) {
        // Frame anclado al centro del viewport (o al playhead si está visible).
        const anchorScreenX =
          playheadX >= el.scrollLeft && playheadX <= el.scrollLeft + el.clientWidth
            ? playheadX - el.scrollLeft
            : el.clientWidth / 2;
        const anchorFrame = (el.scrollLeft + anchorScreenX) / pixelsPerFrame;
        setPixelsPerFrame(clamped);
        // Tras el cambio de ppf, reposicionamos el scroll en el próximo frame.
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollLeft = anchorFrame * clamped - anchorScreenX;
          }
        });
      } else {
        setPixelsPerFrame(clamped);
      }
    },
    [pixelsPerFrame, playheadX, setPixelsPerFrame],
  );

  const zoomIn = useCallback(
    () => zoomKeepingPlayhead(pixelsPerFrame * 1.4),
    [pixelsPerFrame, zoomKeepingPlayhead],
  );
  const zoomOut = useCallback(
    () => zoomKeepingPlayhead(pixelsPerFrame / 1.4),
    [pixelsPerFrame, zoomKeepingPlayhead],
  );

  // --- Scrub del playhead arrastrable (triángulo) ---
  const scrubFrom = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft;
      setCurrentFrame(x / pixelsPerFrame);
    },
    [pixelsPerFrame, setCurrentFrame],
  );

  const onPlayheadPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const onMove = (ev: PointerEvent) => scrubFrom(ev.clientX);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [scrubFrom],
  );

  // --- Selección por recuadro (marquee) en zona vacía de pistas ---
  // Coordenadas relativas al contenido desplazable (incluye scrollLeft/Top).
  const [marquee, setMarquee] = useState<
    { x0: number; y0: number; x1: number; y1: number } | null
  >(null);

  const onLanesPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Solo si el gesto empieza en el fondo del área (no sobre un clip/carril).
      if (e.target !== e.currentTarget) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const startX = e.clientX - rect.left + el.scrollLeft;
      const startY = e.clientY - rect.top + el.scrollTop;

      // Mueve el playhead al instante (clic simple) y deselecciona.
      setCurrentFrame(startX / pixelsPerFrame);
      selectClip(null);

      let moved = false;
      const RULER_H = 28;

      const hitTest = (x0: number, y0: number, x1: number, y1: number) => {
        const left = Math.min(x0, x1);
        const right = Math.max(x0, x1);
        const top = Math.min(y0, y1);
        const bottom = Math.max(y0, y1);
        const fromFrame = left / pixelsPerFrame;
        const toFrame = right / pixelsPerFrame;
        const ids: string[] = [];
        tracksTopToBottom.forEach((track, i) => {
          const laneTop = RULER_H + i * TRACK_HEIGHT;
          const laneBottom = laneTop + TRACK_HEIGHT;
          if (bottom < laneTop || top > laneBottom) return;
          for (const c of track.clips) {
            if (c.start < toFrame && c.start + c.duration > fromFrame) ids.push(c.id);
          }
        });
        return ids;
      };

      const onMove = (ev: PointerEvent) => {
        const x1 = ev.clientX - rect.left + el.scrollLeft;
        const y1 = ev.clientY - rect.top + el.scrollTop;
        if (!moved && Math.abs(x1 - startX) < 4 && Math.abs(y1 - startY) < 4) return;
        moved = true;
        setMarquee({ x0: startX, y0: startY, x1, y1 });
        setSelectedClipIds(hitTest(startX, startY, x1, y1));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setMarquee(null);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [pixelsPerFrame, setCurrentFrame, selectClip, setSelectedClipIds, tracksTopToBottom],
  );

  // Sincroniza el scroll vertical de las cabeceras con el de los carriles.
  const onLanesScroll = useCallback(() => {
    onScroll();
    if (headersRef.current && scrollRef.current) {
      headersRef.current.scrollTop = scrollRef.current.scrollTop;
    }
  }, [onScroll]);

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

        {/* Rango I/O: aparece solo cuando hay un rango válido (teclas I y O). */}
        {hasRange && inFrame != null && outFrame != null && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={exportRange}
              className="flex items-center gap-1 rounded-md border border-accent bg-accent/15 px-2.5 py-1 text-xs text-accent hover:bg-accent/25"
              title="Renderizar solo el rango entre la entrada (I) y la salida (O)"
            >
              <Download size={14} /> Exportar rango
            </button>
            <span className="text-[10px] tabular-nums text-muted">
              {((Math.abs(outFrame - inFrame)) / fps).toFixed(1)}s
            </span>
            <button
              type="button"
              onClick={clearRange}
              className="rounded-md border border-border bg-panel-2 p-1 text-muted hover:text-text"
              title="Quitar rango I/O"
            >
              <X size={14} />
            </button>
          </div>
        )}

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
          {/* Scroll vertical sincronizado con los carriles (scrollbar oculto). */}
          <div
            ref={headersRef}
            className="flex flex-col overflow-y-hidden"
          >
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

        {/* Área de pistas con scroll horizontal y vertical */}
        <div
          ref={scrollRef}
          onPointerDown={onLanesPointerDown}
          onScroll={onLanesScroll}
          className="relative min-w-0 flex-1 overflow-auto"
        >
          <div className="relative" style={{ width: contentWidth }}>
            {/* Regla pegada arriba para que no desaparezca al hacer scroll vertical. */}
            <div className="sticky top-0 z-30">
              <Ruler width={contentWidth} viewFromFrame={viewFromFrame} viewToFrame={viewToFrame} />
            </div>

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

            {/* Recuadro de selección (marquee) */}
            {marquee && (
              <div
                className="pointer-events-none absolute z-20 border border-accent bg-accent/15"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                }}
              />
            )}

            {/* Playhead: cruza la regla y todas las pistas */}
            <div
              className="pointer-events-none absolute top-0 z-10 w-px bg-[var(--danger)]"
              style={{ left: playheadX, bottom: 0 }}
            >
              {/* Triángulo con hit-area: arrastrable para scrubear como la regla. */}
              <div
                onPointerDown={onPlayheadPointerDown}
                className="pointer-events-auto absolute -left-2 top-0 h-4 w-4 cursor-ew-resize"
                title="Arrastra para mover el playhead"
              >
                <div className="absolute left-[3px] top-0 h-2.5 w-2.5 -translate-y-px rotate-45 bg-[var(--danger)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
