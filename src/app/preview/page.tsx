"use client";

import { useEffect, useMemo, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { VideoComposition } from "@/remotion/VideoComposition";
import { useEditor } from "@/lib/store";

/**
 * Ventana de PREVIEW desprendible (2º monitor). Monta SOLO el Player de Remotion,
 * sincronizado con el editor: el documento llega por el mismo SSE (store.connect),
 * y el frame/playing por un BroadcastChannel que emite la ventana principal.
 * Es SLAVE: sigue al editor, no edita.
 */
export default function PreviewWindow() {
  const playerRef = useRef<PlayerRef>(null);
  const connect = useEditor((s) => s.connect);
  const document = useEditor((s) => s.document);
  const assets = useEditor((s) => s.assets);

  useEffect(() => {
    connect();
  }, [connect]);

  const proxyMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of assets) if (a.proxySrc) m[a.src] = a.proxySrc;
    return m;
  }, [assets]);

  const inputProps = useMemo(() => ({ document, preview: true, proxyMap }), [document, proxyMap]);

  // Recibe frame/playing de la ventana principal (mismo origin → BroadcastChannel).
  useEffect(() => {
    const bc = new BroadcastChannel("cutgent-transport");
    bc.onmessage = (e: MessageEvent) => {
      const ref = playerRef.current;
      if (!ref) return;
      const { frame, playing } = (e.data ?? {}) as { frame?: number; playing?: boolean };
      const isPlaying = ref.isPlaying?.() ?? false;
      // En play solo resincroniza ante deriva grande (evita judder por reseeks ~15Hz).
      const tol = isPlaying ? Math.max(2, document.fps / 2) : 1;
      if (typeof frame === "number" && Math.abs(ref.getCurrentFrame() - frame) > tol) ref.seekTo(frame);
      if (playing === true) {
        const pr = ref.play() as unknown as Promise<void> | undefined;
        pr?.catch?.(() => {}); // autoplay puede rechazar; ignorar
      } else if (playing === false) ref.pause();
    };
    return () => bc.close();
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
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
  );
}
