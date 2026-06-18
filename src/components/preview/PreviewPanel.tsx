"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Player, type PlayerRef } from "@remotion/player";
import { VideoComposition } from "@/remotion/VideoComposition";
import { useEditor } from "@/lib/store";
import { TransportControls } from "./TransportControls";
import { ScopesPanel } from "./ScopesPanel";

/**
 * Panel de previsualización: monta el <Player> de Remotion con la composición
 * compartida y lo mantiene sincronizado bidireccionalmente con el store
 * (frame actual y estado de reproducción), evitando bucles de actualización.
 */
export function PreviewPanel() {
  const playerRef = useRef<PlayerRef>(null);

  const document = useEditor((s) => s.document);
  const assets = useEditor((s) => s.assets);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const currentFrame = useEditor((s) => s.currentFrame);
  const playing = useEditor((s) => s.playing);
  const setCurrentFrame = useEditor((s) => s.setCurrentFrame);
  const setPlaying = useEditor((s) => s.setPlaying);
  const [showScopes, setShowScopes] = useState(false);

  // Mapa src→proxy para preview fluido (el render usa el original).
  const proxyMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of assets) if (a.proxySrc) m[a.src] = a.proxySrc;
    return m;
  }, [assets]);

  // Memoizado para no recrear el objeto (evita re-renders del Player).
  const inputProps = useMemo(
    () => ({ document, preview: true, proxyMap, selectedClipId }),
    [document, proxyMap, selectedClipId],
  );

  // Player -> store: escucha eventos del Player y refleja su estado.
  useEffect(() => {
    const ref = playerRef.current;
    if (!ref) return;

    const onFrame = (e: { detail: { frame: number } }) => setCurrentFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    ref.addEventListener("frameupdate", onFrame);
    ref.addEventListener("play", onPlay);
    ref.addEventListener("pause", onPause);

    return () => {
      ref.removeEventListener("frameupdate", onFrame);
      ref.removeEventListener("play", onPlay);
      ref.removeEventListener("pause", onPause);
    };
  }, [setCurrentFrame, setPlaying]);

  // store.playing -> Player
  useEffect(() => {
    const ref = playerRef.current;
    if (!ref) return;
    if (playing) {
      ref.play();
    } else {
      ref.pause();
    }
  }, [playing]);

  // store.currentFrame -> Player (sólo si difiere, para no pelear con frameupdate)
  useEffect(() => {
    const ref = playerRef.current;
    if (!ref) return;
    if (Math.abs(ref.getCurrentFrame() - currentFrame) > 1) {
      ref.seekTo(currentFrame);
    }
  }, [currentFrame]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-bg">
      {/* Toggle de scopes (esquina sup-der) + overlay */}
      <button
        type="button"
        onClick={() => setShowScopes((v) => !v)}
        title="Scopes (histograma / waveform / vectorscopio)"
        className={`absolute right-2 top-2 z-20 flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors ${
          showScopes ? "bg-accent text-white" : "bg-panel/90 text-muted hover:text-text"
        }`}
      >
        <BarChart3 size={14} /> Scopes
      </button>
      {showScopes && (
        <div className="absolute right-2 top-11 z-20">
          <ScopesPanel />
        </div>
      )}

      {/* Zona del player: fondo negro. El Player de Remotion hace letterbox
          (mantiene el aspect ratio y centra) dentro del área disponible. Le
          damos un contenedor con tamaño DEFINIDO (h/w-full) — un wrapper con
          solo aspect-ratio + max-* colapsaba a 0×0 (preview en negro). */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black p-4">
        <Player
          ref={playerRef}
          component={VideoComposition}
          inputProps={inputProps}
          durationInFrames={Math.max(1, document.durationInFrames)}
          fps={document.fps}
          compositionWidth={document.width}
          compositionHeight={document.height}
          style={{ width: "100%", height: "100%" }}
          controls={false}
          acknowledgeRemotionLicense
        />
      </div>

      <TransportControls />
    </div>
  );
}
