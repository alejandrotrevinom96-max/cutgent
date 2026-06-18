"use client";

import { memo, useCallback, useMemo, useState } from "react";
import {
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import type { Track } from "@/lib/schema";
import { ClipBlock } from "./ClipBlock";

export const TRACK_HEIGHT = 56;
export const HEADER_WIDTH = 160;

interface TrackHeaderProps {
  track: Track;
}

/** Cabecera de pista: nombre editable + controles (mute/hidden/lock/volumen). */
export function TrackHeader({ track }: TrackHeaderProps) {
  const runCommand = useEditor((s) => s.runCommand);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(track.name);

  const commitName = useCallback(() => {
    setEditing(false);
    const name = draftName.trim() || track.name;
    if (name !== track.name) {
      void runCommand({ type: "update_track", trackId: track.id, patch: { name } });
    } else {
      setDraftName(track.name);
    }
  }, [draftName, runCommand, track.id, track.name]);

  const toggle = useCallback(
    (key: "muted" | "hidden" | "locked") => {
      void runCommand({
        type: "update_track",
        trackId: track.id,
        patch: { [key]: !track[key] },
      });
    },
    [runCommand, track],
  );

  const setVolume = useCallback(
    (v: number) => {
      void runCommand({ type: "update_track", trackId: track.id, patch: { volume: v } });
    },
    [runCommand, track.id],
  );

  const removeTrack = useCallback(() => {
    void runCommand({ type: "remove_track", trackId: track.id });
  }, [runCommand, track.id]);

  return (
    <div
      className="flex shrink-0 flex-col justify-between gap-1 border-b border-r border-border bg-panel px-2 py-1.5"
      style={{ width: HEADER_WIDTH, height: TRACK_HEIGHT }}
    >
      {/* Nombre */}
      <div className="flex items-center gap-1">
        {editing ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setDraftName(track.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-border bg-panel-2 px-1 py-0.5 text-xs text-text outline-none focus:border-accent"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => {
              setDraftName(track.name);
              setEditing(true);
            }}
            className="min-w-0 flex-1 truncate text-left text-xs font-medium text-text"
            title={`${track.name} (doble clic para renombrar)`}
          >
            {track.name}
          </button>
        )}
        <button
          type="button"
          onClick={removeTrack}
          className="rounded p-0.5 text-muted hover:bg-panel-2 hover:text-[var(--danger)]"
          title="Eliminar pista"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => toggle("muted")}
          className={`rounded p-0.5 hover:bg-panel-2 ${track.muted ? "text-[var(--danger)]" : "text-muted hover:text-text"}`}
          title={track.muted ? "Activar audio" : "Silenciar"}
        >
          {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <button
          type="button"
          onClick={() => toggle("hidden")}
          className={`rounded p-0.5 hover:bg-panel-2 ${track.hidden ? "text-[var(--danger)]" : "text-muted hover:text-text"}`}
          title={track.hidden ? "Mostrar pista" : "Ocultar pista"}
        >
          {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          type="button"
          onClick={() => toggle("locked")}
          className={`rounded p-0.5 hover:bg-panel-2 ${track.locked ? "text-accent" : "text-muted hover:text-text"}`}
          title={track.locked ? "Desbloquear pista" : "Bloquear pista"}
        >
          {track.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={track.volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-1 min-w-0 flex-1"
          title={`Volumen ${Math.round(track.volume * 100)}%`}
        />
      </div>
    </div>
  );
}

interface TrackLaneProps {
  track: Track;
  /** Ancho total del carril en px. */
  width: number;
  /** Ventana visible en frames (virtualización). */
  viewFromFrame: number;
  viewToFrame: number;
}

/** Carril de la pista: fondo + bloques de clips posicionados en el tiempo.
 *  Memoizado: durante la reproducción el playhead cambia ~30-60×/s pero sus props
 *  (track/width/ventana) no, así que se evita re-renderizar todo el carril por tick. */
export const TrackLane = memo(function TrackLane({ track, width, viewFromFrame, viewToFrame }: TrackLaneProps) {
  const selectClip = useEditor((s) => s.selectClip);

  // Virtualización: solo montamos los clips que intersecan la ventana visible.
  const visibleClips = useMemo(
    () =>
      track.clips.filter(
        (c) => c.start < viewToFrame && c.start + c.duration > viewFromFrame,
      ),
    [track.clips, viewFromFrame, viewToFrame],
  );

  return (
    <div
      onPointerDown={(e) => {
        // Click en el fondo del carril deselecciona.
        if (e.target === e.currentTarget) selectClip(null);
      }}
      className="relative border-b border-border"
      style={{
        width,
        height: TRACK_HEIGHT,
        background: track.hidden ? "transparent" : "var(--track)",
        opacity: track.hidden ? 0.4 : 1,
      }}
    >
      {visibleClips.map((clip) => (
        <ClipBlock key={clip.id} clip={clip} locked={track.locked} />
      ))}
    </div>
  );
});
