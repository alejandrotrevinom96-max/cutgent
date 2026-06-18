"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Film,
  Image as ImageIcon,
  Music,
  Type,
  Square,
  Layers,
  Copy,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEditor } from "@/lib/store";
import { newId } from "@/lib/factory";
import { getWaveformPeaks } from "@/lib/waveform-client";
import type { Clip, ClipType } from "@/lib/schema";

/** Tipo de gesto activo sobre un clip. */
type DragMode = "move" | "resize-right" | "resize-left";

interface ClipBlockProps {
  clip: Clip;
  /** True si la pista está bloqueada (sin interacción de edición). */
  locked: boolean;
}

/** Apariencia (color de acento + ícono) según el tipo de clip. */
const CLIP_LOOK: Record<ClipType, { color: string; Icon: LucideIcon }> = {
  video: { color: "#6366f1", Icon: Film },
  image: { color: "#0ea5e9", Icon: ImageIcon },
  audio: { color: "#22c55e", Icon: Music },
  text: { color: "#f59e0b", Icon: Type },
  shape: { color: "#ec4899", Icon: Square },
  solid: { color: "#64748b", Icon: Layers },
};

const HANDLE_PX = 8;
const SNAP_PX = 8;

/** Imán: ajusta `value` (frames) al objetivo más cercano dentro del umbral. */
function snapTo(value: number, targets: number[], ppf: number): number {
  const threshold = SNAP_PX / ppf;
  let best = value;
  let bestDist = threshold;
  for (const t of targets) {
    const dist = Math.abs(value - t);
    if (dist <= bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

export function ClipBlock({ clip, locked }: ClipBlockProps) {
  const pixelsPerFrame = useEditor((s) => s.pixelsPerFrame);
  const selectedClipIds = useEditor((s) => s.selectedClipIds);
  const selectClip = useEditor((s) => s.selectClip);
  const previewClipLocal = useEditor((s) => s.previewClipLocal);
  const runCommand = useEditor((s) => s.runCommand);
  const runCommands = useEditor((s) => s.runCommands);

  // Snapshot del estado al iniciar el gesto, para calcular deltas.
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    initialStart: number;
    initialDuration: number;
    nextStart: number;
    nextDuration: number;
    targets: number[];
    /** Para mover en grupo (selección múltiple). */
    group: { id: string; initialStart: number }[];
    appliedDelta: number;
    hasTrim: boolean;
    initialTrim: number;
    rate: number;
    nextTrim: number;
  } | null>(null);

  // Remueve los listeners de window si el componente se desmonta a mitad de drag.
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const selected = selectedClipIds.includes(clip.id);
  const { color, Icon } = CLIP_LOOK[clip.type];

  const left = clip.start * pixelsPerFrame;
  const width = Math.max(clip.duration * pixelsPerFrame, 6);

  const beginDrag = useCallback(
    (mode: DragMode, e: React.PointerEvent) => {
      if (locked) return;
      e.preventDefault();
      e.stopPropagation();

      const state = useEditor.getState();

      // Click con modificador sobre el cuerpo → alterna selección (sin arrastrar).
      if (mode === "move" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
        state.toggleClipSelection(clip.id);
        return;
      }

      // Si el clip no está en la selección, seleccionarlo (single). Si ya está
      // en una multi-selección, mantenerla para poder mover el grupo.
      if (!state.selectedClipIds.includes(clip.id)) selectClip(clip.id);

      const ids = useEditor.getState().selectedClipIds;
      const groupIds = mode === "move" && ids.includes(clip.id) && ids.length > 1 ? ids : [clip.id];
      const byId = new Map<string, number>();
      for (const tr of state.document.tracks) for (const cc of tr.clips) byId.set(cc.id, cc.start);
      const group = groupIds.map((id) => ({ id, initialStart: byId.get(id) ?? clip.start }));

      // Objetivos de imán: bordes de clips que NO son del grupo + playhead + inicio.
      const targets: number[] = [0, state.currentFrame];
      for (const tr of state.document.tracks) {
        for (const cc of tr.clips) {
          if (groupIds.includes(cc.id)) continue;
          targets.push(cc.start, cc.start + cc.duration);
        }
      }

      dragRef.current = {
        mode,
        startX: e.clientX,
        initialStart: clip.start,
        initialDuration: clip.duration,
        nextStart: clip.start,
        nextDuration: clip.duration,
        targets,
        group,
        appliedDelta: 0,
        hasTrim: "trimStart" in clip,
        initialTrim: "trimStart" in clip ? (clip as { trimStart: number }).trimStart : 0,
        rate: "playbackRate" in clip ? (clip as { playbackRate: number }).playbackRate : 1,
        nextTrim: "trimStart" in clip ? (clip as { trimStart: number }).trimStart : 0,
      };

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        // Lee el zoom en vivo (puede cambiar a mitad de gesto).
        const ppf = useEditor.getState().pixelsPerFrame;
        const deltaFrames = (ev.clientX - d.startX) / ppf;

        if (d.mode === "move") {
          let start = Math.max(0, Math.round(d.initialStart + deltaFrames));
          // Imán: intenta encajar el borde de inicio o el de fin (del primario).
          const snappedStart = snapTo(start, d.targets, ppf);
          const end = start + d.initialDuration;
          const snappedEnd = snapTo(end, d.targets, ppf);
          if (snappedStart !== start) start = snappedStart;
          else if (snappedEnd !== end) start = Math.max(0, snappedEnd - d.initialDuration);
          d.nextStart = start;
          d.appliedDelta = start - d.initialStart;
          // Mueve todo el grupo con el mismo delta.
          for (const g of d.group) {
            previewClipLocal(g.id, { start: Math.max(0, g.initialStart + d.appliedDelta) });
          }
        } else if (d.mode === "resize-right") {
          const end = snapTo(Math.round(d.initialStart + d.initialDuration + deltaFrames), d.targets, ppf);
          const duration = Math.max(1, end - d.initialStart);
          d.nextDuration = duration;
          previewClipLocal(clip.id, { duration });
        } else {
          // resize-left: ajusta start y duration; en video/audio avanza trimStart
          // para que el contenido no se descuadre.
          const rawStart = snapTo(Math.round(d.initialStart + deltaFrames), d.targets, ppf);
          const maxStart = d.initialStart + d.initialDuration - 1;
          const start = Math.max(0, Math.min(rawStart, maxStart));
          const duration = d.initialStart + d.initialDuration - start;
          d.nextStart = start;
          d.nextDuration = duration;
          const patch: Record<string, number> = { start, duration };
          if (d.hasTrim) {
            d.nextTrim = Math.max(0, Math.round(d.initialTrim + (start - d.initialStart) * d.rate));
            patch.trimStart = d.nextTrim;
          }
          previewClipLocal(clip.id, patch as Partial<Clip>);
        }
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        cleanupRef.current = null;
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;

        // Confirma con el comando adecuado solo si hubo cambio real.
        if (d.mode === "move") {
          if (d.appliedDelta !== 0) {
            void runCommands(
              d.group.map((g) => ({
                type: "move_clip" as const,
                clipId: g.id,
                start: Math.max(0, g.initialStart + d.appliedDelta),
              })),
            );
          }
        } else if (d.mode === "resize-right") {
          if (d.nextDuration !== d.initialDuration) {
            void runCommand({
              type: "update_clip",
              clipId: clip.id,
              patch: { duration: d.nextDuration },
            });
          }
        } else {
          if (d.nextStart !== d.initialStart || d.nextDuration !== d.initialDuration) {
            void runCommand({
              type: "update_clip",
              clipId: clip.id,
              patch: {
                start: d.nextStart,
                duration: d.nextDuration,
                ...(d.hasTrim ? { trimStart: d.nextTrim } : {}),
              },
            });
          }
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      cleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
    },
    [
      clip.id,
      clip.start,
      clip.duration,
      locked,
      pixelsPerFrame,
      previewClipLocal,
      runCommand,
      runCommands,
      selectClip,
    ],
  );

  const onDuplicate = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      void runCommand({ type: "duplicate_clip", clipId: clip.id, newId: newId("clip") });
    },
    [clip.id, runCommand],
  );

  const onRemove = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      void runCommand({ type: "remove_clip", clipId: clip.id });
    },
    [clip.id, runCommand],
  );

  return (
    <div
      onPointerDown={(e) => beginDrag("move", e)}
      className={`group absolute top-1 bottom-1 flex select-none items-center overflow-hidden rounded-md text-xs ${
        locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{
        left,
        width,
        background: `${color}26`,
        border: `1px solid ${selected ? "var(--accent)" : `${color}80`}`,
        boxShadow: selected ? "0 0 0 1px var(--accent)" : undefined,
      }}
      title={clip.name}
    >
      {/* Waveform de fondo (audio/video) */}
      {(clip.type === "audio" || clip.type === "video") && "src" in clip && clip.src && width > 24 && (
        <Waveform src={clip.src} color={color} />
      )}

      {/* Barra de color a la izquierda */}
      <span className="h-full w-1 shrink-0" style={{ background: color }} />

      {/* Contenido */}
      <span className="relative flex min-w-0 flex-1 items-center gap-1.5 px-1.5">
        <Icon size={12} style={{ color }} className="shrink-0" />
        <span className="truncate text-text">{clip.name}</span>
      </span>

      {/* Acciones (visibles al seleccionar o al hover) */}
      {!locked && (
        <span
          className={`mr-1 flex shrink-0 items-center gap-0.5 transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            onPointerDown={onDuplicate}
            className="rounded p-0.5 text-muted hover:bg-panel-2 hover:text-text"
            title="Duplicar clip"
          >
            <Copy size={12} />
          </button>
          <button
            type="button"
            onPointerDown={onRemove}
            className="rounded p-0.5 text-muted hover:bg-panel-2 hover:text-[var(--danger)]"
            title="Eliminar clip"
          >
            <Trash2 size={12} />
          </button>
        </span>
      )}

      {/* Handles de redimensión */}
      {!locked && (
        <>
          <span
            onPointerDown={(e) => beginDrag("resize-left", e)}
            className="absolute left-0 top-0 h-full cursor-ew-resize opacity-0 group-hover:opacity-100"
            style={{ width: HANDLE_PX, background: `${color}66` }}
          />
          <span
            onPointerDown={(e) => beginDrag("resize-right", e)}
            className="absolute right-0 top-0 h-full cursor-ew-resize opacity-0 group-hover:opacity-100"
            style={{ width: HANDLE_PX, background: `${color}66` }}
          />
        </>
      )}
    </div>
  );
}

/** Waveform de fondo: un único <path> simétrico estirado al ancho del clip. */
function Waveform({ src, color }: { src: string; color: string }) {
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    getWaveformPeaks(src).then((p) => {
      if (alive) setPeaks(p);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  if (peaks.length === 0) return null;

  const n = peaks.length;
  let d = "";
  for (let i = 0; i < n; i++) d += `${i === 0 ? "M" : "L"} ${i} ${50 - peaks[i] * 46} `;
  for (let i = n - 1; i >= 0; i--) d += `L ${i} ${50 + peaks[i] * 46} `;
  d += "Z";

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${n} 100`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} fill={color} fillOpacity={0.45} />
    </svg>
  );
}
