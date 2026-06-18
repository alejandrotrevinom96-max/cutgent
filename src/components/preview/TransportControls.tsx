"use client";

import { Pause, Play, SkipBack, SkipForward, ChevronLeft, ChevronRight } from "lucide-react";
import { useEditor } from "@/lib/store";

/**
 * Barra de transporte compacta debajo del player: navegación por frames,
 * play/pausa y lectura del tiempo actual / total en formato mm:ss:ff.
 */
export function TransportControls() {
  const document = useEditor((s) => s.document);
  const currentFrame = useEditor((s) => s.currentFrame);
  const playing = useEditor((s) => s.playing);
  const setCurrentFrame = useEditor((s) => s.setCurrentFrame);
  const setPlaying = useEditor((s) => s.setPlaying);

  const fps = document.fps > 0 ? document.fps : 30;
  const lastFrame = Math.max(0, document.durationInFrames - 1);

  const goStart = () => setCurrentFrame(0);
  const goEnd = () => setCurrentFrame(lastFrame);
  const stepBack = () => setCurrentFrame(Math.max(0, currentFrame - 1));
  const stepForward = () => setCurrentFrame(Math.min(lastFrame, currentFrame + 1));
  const togglePlay = () => setPlaying(!playing);

  return (
    <div className="flex items-center gap-1 border-t border-border bg-panel px-3 py-2">
      <TransportButton label="Ir al inicio" onClick={goStart}>
        <SkipBack size={16} />
      </TransportButton>
      <TransportButton label="Frame anterior" onClick={stepBack}>
        <ChevronLeft size={16} />
      </TransportButton>

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pausar" : "Reproducir"}
        title={playing ? "Pausar" : "Reproducir"}
        className="mx-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-2"
      >
        {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
      </button>

      <TransportButton label="Frame siguiente" onClick={stepForward}>
        <ChevronRight size={16} />
      </TransportButton>
      <TransportButton label="Ir al final" onClick={goEnd}>
        <SkipForward size={16} />
      </TransportButton>

      <div className="ml-auto flex items-center gap-2 font-mono text-xs tabular-nums text-muted">
        <span className="text-text">{formatTimecode(currentFrame, fps)}</span>
        <span className="text-muted">/</span>
        <span>{formatTimecode(document.durationInFrames, fps)}</span>
      </div>
    </div>
  );
}

interface TransportButtonProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function TransportButton({ label, onClick, children }: TransportButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-text"
    >
      {children}
    </button>
  );
}

/** Formatea un número de frames en mm:ss:ff usando los fps del proyecto. */
function formatTimecode(frame: number, fps: number): string {
  const safeFrame = Math.max(0, Math.round(frame));
  const totalSeconds = Math.floor(safeFrame / fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frames = safeFrame % fps;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}
