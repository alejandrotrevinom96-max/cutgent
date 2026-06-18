"use client";

import { useCallback, useMemo } from "react";
import { useEditor } from "@/lib/store";

interface RulerProps {
  /** Ancho total del área de pistas en px (frames totales * pixelsPerFrame). */
  width: number;
  /** Ventana visible en frames (virtualización de marcas). */
  viewFromFrame?: number;
  viewToFrame?: number;
}

/** Elige un intervalo de marcas "redondo" en frames según el zoom y el fps. */
function chooseStep(pixelsPerFrame: number, fps: number): number {
  // Apuntamos a una marca cada ~80px aprox.
  const targetFrames = 80 / pixelsPerFrame;
  // Pasos candidatos en segundos, traducidos a frames.
  const secondSteps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of secondSteps) {
    if (s * fps >= targetFrames) return Math.round(s * fps);
  }
  return Math.round(secondSteps[secondSteps.length - 1] * fps);
}

/** Formatea un número de frames como m:ss (o s.s si es subsegundo). */
function formatTime(frames: number, fps: number): string {
  const totalSeconds = frames / fps;
  if (totalSeconds < 1 && totalSeconds > 0) return `${totalSeconds.toFixed(1)}s`;
  const total = Math.floor(totalSeconds);
  const m = Math.floor(total / 60);
  const s = total % 60; // floor evita el caso "60s" de Math.round
  if (m === 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Ruler({ width, viewFromFrame = 0, viewToFrame = Infinity }: RulerProps) {
  const pixelsPerFrame = useEditor((s) => s.pixelsPerFrame);
  const fps = useEditor((s) => s.document.fps);
  const totalFrames = useEditor((s) => s.document.durationInFrames);
  const setCurrentFrame = useEditor((s) => s.setCurrentFrame);
  const markers = useEditor((s) => s.document.markers ?? []);
  const runCommand = useEditor((s) => s.runCommand);

  const step = useMemo(() => chooseStep(pixelsPerFrame, fps), [pixelsPerFrame, fps]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    // Virtualización: solo generamos marcas dentro de la ventana visible.
    const from = Math.max(0, Math.floor(viewFromFrame / step) * step);
    const to = Math.min(totalFrames, viewToFrame);
    for (let f = from; f <= to; f += step) out.push(f);
    return out;
  }, [totalFrames, step, viewFromFrame, viewToFrame]);

  const scrub = useCallback(
    (clientX: number, currentTarget: HTMLElement) => {
      const rect = currentTarget.getBoundingClientRect();
      const x = clientX - rect.left;
      setCurrentFrame(x / pixelsPerFrame);
    },
    [pixelsPerFrame, setCurrentFrame],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Capturamos el elemento ahora: React anula e.currentTarget tras el handler.
      const el = e.currentTarget;
      scrub(e.clientX, el);

      const onMove = (ev: PointerEvent) => scrub(ev.clientX, el);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [scrub],
  );

  return (
    <div
      onPointerDown={onPointerDown}
      className="relative h-7 cursor-pointer select-none border-b border-border bg-panel"
      style={{ width }}
    >
      {ticks.map((f) => (
        <div
          key={f}
          className="absolute top-0 h-full"
          style={{ left: f * pixelsPerFrame }}
        >
          <div className="h-2 w-px bg-border" />
          <span className="ml-1 text-[10px] text-muted">{formatTime(f, fps)}</span>
        </div>
      ))}

      {/* Marcadores / capítulos / notas */}
      {markers
        .filter((m) => m.frame >= viewFromFrame && m.frame <= viewToFrame)
        .map((m) => {
          const isNote = m.kind === "note";
          // Color de nota según estado (pendiente=color base, aplicada=verde, descartada=gris).
          const noteColor =
            m.status === "applied" ? "#10b981" : m.status === "dismissed" ? "#71717a" : m.color;
          const color = isNote ? noteColor : m.color;
          const title = isNote
            ? `📝 ${m.note || "Nota"} — clic: ir · Alt+clic: borrar`
            : `${m.label || "Marcador"} — clic: ir · Alt+clic: borrar`;
          return (
            <div
              key={m.id}
              className="absolute bottom-0 top-0 z-10 w-px cursor-pointer"
              style={{ left: m.frame * pixelsPerFrame, background: color, opacity: m.status === "dismissed" ? 0.5 : 1 }}
              title={title}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.altKey) {
                  void runCommand({ type: "remove_marker", markerId: m.id });
                } else {
                  setCurrentFrame(m.frame);
                }
              }}
            >
              {/* Nota = rombo; capítulo = cuadrado. */}
              <div
                className={`absolute left-0 top-0 h-2 w-2 ${isNote ? "rotate-45 rounded-[1px]" : "rounded-sm"}`}
                style={{ background: color }}
              />
              {/* Nota de rango: barra de frame → frameEnd. */}
              {isNote && m.frameEnd != null && m.frameEnd > m.frame && (
                <div
                  className="absolute bottom-0 h-1 rounded-sm"
                  style={{ left: 0, width: (m.frameEnd - m.frame) * pixelsPerFrame, background: color, opacity: 0.55 }}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}
