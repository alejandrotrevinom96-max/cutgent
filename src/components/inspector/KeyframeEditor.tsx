"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import type {
  AnimatableProperty,
  Clip,
  Easing,
  Keyframe,
} from "@/lib/schema";
import { SelectField, NumberField } from "./Field";

/**
 * Editor visual de keyframes con curvas (estilo After Effects / DaVinci).
 *
 * El eje X representa el frame RELATIVO al inicio del clip (0..clip.duration),
 * y el eje Y el valor de la propiedad seleccionada. Permite añadir keyframes
 * con clic, arrastrarlos (frame + valor), seleccionarlos para editar su valor
 * y easing, y eliminarlos. Todo se persiste con los comandos add_keyframe /
 * remove_keyframe del contrato.
 */

const EASINGS: Easing[] = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "spring",
];

const PROP_LABEL: Record<AnimatableProperty, string> = {
  x: "X",
  y: "Y",
  scale: "Escala",
  rotation: "Rotación",
  opacity: "Opacidad",
  volume: "Volumen",
};

/** Rango Y base por propiedad. */
const BASE_RANGE: Record<AnimatableProperty, { min: number; max: number }> = {
  x: { min: -1000, max: 1000 },
  y: { min: -1000, max: 1000 },
  scale: { min: 0, max: 4 },
  rotation: { min: -180, max: 180 },
  opacity: { min: 0, max: 1 },
  volume: { min: 0, max: 1 },
};

// Geometría del gráfico SVG (coordenadas internas del viewBox).
const VB_W = 320;
const VB_H = 180;
const PAD_L = 34;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 22;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Lee el valor base (sin animar) de una propiedad del clip. */
function readBaseValue(clip: Clip, property: AnimatableProperty): number {
  switch (property) {
    case "x":
      return clip.x;
    case "y":
      return clip.y;
    case "scale":
      return clip.scale;
    case "rotation":
      return clip.rotation;
    case "opacity":
      return clip.opacity;
    case "volume":
      if (clip.type === "video" || clip.type === "audio") return clip.volume;
      return 1;
    default: {
      const _exhaustive: never = property;
      return _exhaustive;
    }
  }
}

/** Propiedades disponibles según el tipo de clip (volume solo video/audio). */
function availableProps(clip: Clip): AnimatableProperty[] {
  const hasAudio = clip.type === "video" || clip.type === "audio";
  const base: AnimatableProperty[] = ["x", "y", "scale", "rotation", "opacity"];
  return hasAudio ? [...base, "volume"] : base;
}

interface DragState {
  index: number;
  frame: number;
  value: number;
}

export function KeyframeEditor({
  clip,
  clipId,
}: {
  clip: Clip;
  clipId: string;
}) {
  const runCommand = useEditor((s) => s.runCommand);
  const runCommands = useEditor((s) => s.runCommands);
  const currentFrame = useEditor((s) => s.currentFrame);

  const props = availableProps(clip);
  const [property, setProperty] = useState<AnimatableProperty>("x");

  // Si la propiedad seleccionada deja de estar disponible (cambio de clip), corrige.
  useEffect(() => {
    if (!props.includes(property)) setProperty(props[0] ?? "x");
  }, [props, property]);

  // Seleccionamos por FRAME (estable) y no por índice del array ordenado.
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  // Mantén la última info de drag para usarla al soltar sin depender de closures viejos.
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const duration = Math.max(1, clip.duration);

  // Keyframes de la propiedad activa, ordenados por frame.
  const track = clip.keyframeTracks.find((t) => t.property === property);
  const keyframes: Keyframe[] = [...(track?.keyframes ?? [])].sort(
    (a, b) => a.frame - b.frame,
  );

  // ---- Rango Y dinámico (expande para incluir keyframes fuera del rango base) ----
  const base = BASE_RANGE[property];
  let yMin = base.min;
  let yMax = base.max;
  const baseVal = readBaseValue(clip, property);
  const consider: number[] = [baseVal, ...keyframes.map((k) => k.value)];
  if (drag) consider.push(drag.value);
  for (const v of consider) {
    if (v < yMin) yMin = v;
    if (v > yMax) yMax = v;
  }
  if (yMin < base.min || yMax > base.max) {
    const span = yMax - yMin || 1;
    const padY = span * 0.1;
    yMin -= padY;
    yMax += padY;
  }
  const ySpan = yMax - yMin || 1;

  // ---- Helpers de mapeo coordenadas <-> datos ----
  const frameToX = (frame: number): number =>
    PAD_L + (frame / duration) * PLOT_W;
  const valueToY = (value: number): number =>
    PAD_T + (1 - (value - yMin) / ySpan) * PLOT_H;
  const xToFrame = (x: number): number =>
    ((x - PAD_L) / PLOT_W) * duration;
  const yToValue = (y: number): number =>
    yMin + (1 - (y - PAD_T) / PLOT_H) * ySpan;

  const propRange = base;
  const clampValue = (v: number): number => {
    // Permite valores fuera del rango base si el usuario ya los tenía; pero
    // clampa al rango visible expandido para que el punto no escape del panel.
    return clamp(v, yMin, yMax);
  };

  /** Convierte un PointerEvent a coordenadas internas del viewBox. */
  const eventToVB = (
    e: { clientX: number; clientY: number },
  ): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((e.clientX - rect.left) / rect.width) * VB_W;
    const y = ((e.clientY - rect.top) / rect.height) * VB_H;
    return { x, y };
  };

  // ---- Drag global (pointermove / pointerup en window) ----
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const pos = eventToVB(e);
      if (!pos) return;
      const frame = clamp(Math.round(xToFrame(pos.x)), 0, duration);
      const value = clampValue(yToValue(pos.y));
      setDrag({ index: drag.index, frame, value });
    };

    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const kf = keyframes[d.index];
      if (!kf) return;
      const newFrame = clamp(Math.round(d.frame), 0, duration);
      const newValue = clampValue(d.value);
      const easing = kf.easing;
      if (newFrame !== kf.frame) {
        void runCommands([
          { type: "remove_keyframe", clipId, property, frame: kf.frame },
          {
            type: "add_keyframe",
            clipId,
            property,
            keyframe: { frame: newFrame, value: newValue, easing },
          },
        ]);
        setSelectedFrame(newFrame); // sigue seleccionado en su nueva posición
      } else if (newValue !== kf.value) {
        void runCommand({
          type: "add_keyframe",
          clipId,
          property,
          keyframe: { frame: newFrame, value: newValue, easing },
        });
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.index, clipId, property, duration, yMin, yMax]);

  // ---- Click en zona vacía → añadir keyframe ----
  const onBackgroundPointerDown = (
    e: React.PointerEvent<SVGRectElement>,
  ) => {
    const pos = eventToVB(e);
    if (!pos) return;
    const frame = clamp(Math.round(xToFrame(pos.x)), 0, duration);
    const value = clampValue(yToValue(pos.y));
    void runCommand({
      type: "add_keyframe",
      clipId,
      property,
      keyframe: { frame, value, easing: "ease-in-out" },
    });
  };

  // ---- Iniciar arrastre de un punto ----
  const onPointPointerDown = (
    e: React.PointerEvent<SVGCircleElement>,
    index: number,
  ) => {
    e.stopPropagation();
    const kf = keyframes[index];
    if (!kf) return;
    setSelectedFrame(kf.frame);
    setDrag({ index, frame: kf.frame, value: kf.value });
  };

  // ---- Edición del punto seleccionado ----
  const selectedKf =
    selectedFrame !== null ? keyframes.find((k) => k.frame === selectedFrame) ?? null : null;

  const updateSelectedValue = (newValue: number) => {
    if (!selectedKf) return;
    void runCommand({
      type: "add_keyframe",
      clipId,
      property,
      keyframe: {
        frame: selectedKf.frame,
        value: clamp(newValue, propRange.min, propRange.max),
        easing: selectedKf.easing,
      },
    });
  };

  const updateSelectedEasing = (easing: Easing) => {
    if (!selectedKf) return;
    void runCommand({
      type: "add_keyframe",
      clipId,
      property,
      keyframe: { frame: selectedKf.frame, value: selectedKf.value, easing },
    });
  };

  const removeSelected = () => {
    if (!selectedKf) return;
    void runCommand({
      type: "remove_keyframe",
      clipId,
      property,
      frame: selectedKf.frame,
    });
    setSelectedFrame(null);
  };

  // ---- Datos derivados para el dibujo ----
  // Para el punto en drag, sustituimos sus coordenadas en vivo.
  const drawnPoints = keyframes.map((kf, i) =>
    drag && drag.index === i
      ? { frame: drag.frame, value: drag.value }
      : { frame: kf.frame, value: kf.value },
  );

  const polyline = drawnPoints
    .map((p) => `${frameToX(p.frame).toFixed(2)},${valueToY(p.value).toFixed(2)}`)
    .join(" ");

  const playheadFrame = currentFrame - clip.start;
  const playheadInRange = playheadFrame >= 0 && playheadFrame <= duration;

  // Rejilla: 3 líneas horizontales internas + bordes; verticales en cuartos.
  const hGrid = [0, 0.25, 0.5, 0.75, 1].map((t) => PAD_T + t * PLOT_H);
  const vGrid = [0, 0.25, 0.5, 0.75, 1].map((t) => PAD_L + t * PLOT_W);

  const fmt = (v: number): string =>
    Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(2);

  return (
    <div>
      {/* Selector de propiedad */}
      <SelectField<AnimatableProperty>
        label="Propiedad"
        value={property}
        options={props.map((p) => ({ value: p, label: PROP_LABEL[p] }))}
        onChange={(v) => {
          setProperty(v);
          setSelectedFrame(null);
        }}
      />

      {/* Gráfico SVG */}
      <div className="mt-2 overflow-hidden rounded-md border border-border bg-panel-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="block w-full touch-none select-none"
          style={{ height: 220 }}
          preserveAspectRatio="none"
        >
          {/* Rejilla */}
          {hGrid.map((y, i) => (
            <line
              key={`h${i}`}
              x1={PAD_L}
              y1={y}
              x2={VB_W - PAD_R}
              y2={y}
              stroke="var(--border)"
              strokeWidth={0.5}
              opacity={0.6}
            />
          ))}
          {vGrid.map((x, i) => (
            <line
              key={`v${i}`}
              x1={x}
              y1={PAD_T}
              x2={x}
              y2={PAD_T + PLOT_H}
              stroke="var(--border)"
              strokeWidth={0.5}
              opacity={0.4}
            />
          ))}

          {/* Línea base si no hay keyframes */}
          {keyframes.length === 0 && (
            <line
              x1={PAD_L}
              y1={valueToY(baseVal)}
              x2={VB_W - PAD_R}
              y2={valueToY(baseVal)}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.6}
            />
          )}

          {/* Zona interactiva de fondo (añadir keyframe) */}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={PLOT_W}
            height={PLOT_H}
            fill="transparent"
            onPointerDown={onBackgroundPointerDown}
            style={{ cursor: "crosshair" }}
          />

          {/* Curva / polyline */}
          {drawnPoints.length >= 2 && (
            <polyline
              points={polyline}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}

          {/* Playhead */}
          {playheadInRange && (
            <line
              x1={frameToX(playheadFrame)}
              y1={PAD_T}
              x2={frameToX(playheadFrame)}
              y2={PAD_T + PLOT_H}
              stroke="var(--danger, #ef4444)"
              strokeWidth={1}
              pointerEvents="none"
            />
          )}

          {/* Puntos (keyframes) */}
          {drawnPoints.map((p, i) => {
            const isSel = keyframes[i]?.frame === selectedFrame;
            return (
              <circle
                key={i}
                cx={frameToX(p.frame)}
                cy={valueToY(p.value)}
                r={isSel ? 5 : 4}
                fill={isSel ? "var(--accent)" : "var(--panel)"}
                stroke="var(--accent)"
                strokeWidth={1.5}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => onPointPointerDown(e, i)}
              />
            );
          })}

          {/* Etiquetas eje Y (máx / mín) */}
          <text
            x={PAD_L - 4}
            y={PAD_T + 4}
            textAnchor="end"
            fontSize={8}
            fill="var(--muted, #888)"
          >
            {fmt(yMax)}
          </text>
          <text
            x={PAD_L - 4}
            y={PAD_T + PLOT_H}
            textAnchor="end"
            fontSize={8}
            fill="var(--muted, #888)"
          >
            {fmt(yMin)}
          </text>

          {/* Etiquetas eje X (0 / duration) */}
          <text
            x={PAD_L}
            y={VB_H - 6}
            textAnchor="start"
            fontSize={8}
            fill="var(--muted, #888)"
          >
            0
          </text>
          <text
            x={VB_W - PAD_R}
            y={VB_H - 6}
            textAnchor="end"
            fontSize={8}
            fill="var(--muted, #888)"
          >
            {duration}f
          </text>
        </svg>
      </div>

      {/* Pista cuando no hay keyframes */}
      {keyframes.length === 0 && (
        <p className="mt-2 text-[11px] text-muted">
          Haz clic en el gráfico para añadir un keyframe.
        </p>
      )}

      {/* Edición del keyframe seleccionado */}
      {selectedKf && (
        <div className="mt-3 rounded-md border border-border bg-panel-2 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[11px] text-muted">
              Frame {selectedKf.frame} · {fmt(selectedKf.value)}
            </span>
            <button
              type="button"
              onClick={removeSelected}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-[var(--danger)]"
              title="Eliminar keyframe"
            >
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
          <NumberField
            label="Valor"
            value={selectedKf.value}
            min={propRange.min}
            max={propRange.max}
            step={property === "opacity" || property === "scale" || property === "volume" ? 0.01 : 1}
            onChange={updateSelectedValue}
          />
          <SelectField<Easing>
            label="Easing"
            value={selectedKf.easing}
            options={EASINGS}
            onChange={updateSelectedEasing}
          />
        </div>
      )}
    </div>
  );
}
