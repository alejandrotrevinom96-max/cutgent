"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/store";
import { useDictation } from "@/lib/useDictation";

/** frames → "m:ss.f" (con décimas) para el sello de tiempo de la nota. */
function timecode(frames: number, fps: number): string {
  const total = frames / fps;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const d = Math.floor((total * 10) % 10);
  return `${m}:${s.toString().padStart(2, "0")}.${d}`;
}

/**
 * Compositor de notas anclado al frame actual. Se abre con la tecla N (pausa el
 * vídeo). Escribes o dictas la nota; Enter guarda, Esc cancela. La nota queda
 * `pending` para que el asistente la revise y aplique en lote.
 */
export function NoteComposer() {
  const frame = useEditor((s) => s.noteDraftFrame);
  const fps = useEditor((s) => s.document.fps);
  const addNote = useEditor((s) => s.addNote);
  const close = useEditor((s) => s.closeNoteComposer);

  const [text, setText] = useState("");
  const [voiceUsed, setVoiceUsed] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const dictation = useDictation();

  // Al abrirse (frame pasa a no-null): limpia y enfoca.
  useEffect(() => {
    if (frame != null) {
      setText("");
      setVoiceUsed(false);
      // Enfoque tras el render del overlay.
      requestAnimationFrame(() => taRef.current?.focus());
    } else {
      dictation.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  if (frame == null) return null;

  const save = () => {
    addNote(text, { frame, source: voiceUsed ? "voice" : "text" });
    close();
  };

  const toggleMic = async () => {
    if (dictation.state === "recording") {
      const t = await dictation.stop();
      if (t) {
        setVoiceUsed(true);
        setText((prev) => (prev ? `${prev} ${t}` : t));
      }
      taRef.current?.focus();
    } else {
      await dictation.start();
    }
  };

  const recording = dictation.state === "recording";
  const transcribing = dictation.state === "transcribing";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xl rounded-lg border border-border bg-panel/95 p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <span className="rounded bg-[var(--info)]/20 px-1.5 py-0.5 font-mono text-[var(--info)]">
            ◆ {timecode(frame, fps)}
          </span>
          <span className="text-muted">Nota de edición · frame {frame}</span>
          <span className="ml-auto text-[10px] text-muted">Enter guarda · Esc cancela</span>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
            rows={2}
            placeholder='p. ej. "aquí baja la música", "corta este silencio", "zoom a la cara"'
            className="min-h-[44px] flex-1 resize-none rounded border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={toggleMic}
            disabled={transcribing || !dictation.supported}
            title={
              !dictation.supported
                ? "Micrófono no disponible"
                : recording
                  ? "Detener y transcribir"
                  : "Dictar nota"
            }
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded text-sm ${
              recording
                ? "animate-pulse bg-red-500 text-white"
                : "bg-bg text-muted hover:text-text disabled:opacity-40"
            }`}
          >
            {transcribing ? "…" : "🎤"}
          </button>
        </div>

        {(recording || transcribing || dictation.error) && (
          <div className="mt-1 text-[11px]">
            {recording && <span className="text-[var(--danger)]">● Grabando… (clic 🎤 para terminar)</span>}
            {transcribing && <span className="text-[var(--info)]">Transcribiendo localmente…</span>}
            {dictation.error && <span className="text-[var(--danger)]">{dictation.error}</span>}
          </div>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-xs text-muted hover:text-text"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!text.trim()}
            className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-2 disabled:opacity-40"
          >
            Guardar nota
          </button>
        </div>
      </div>
    </div>
  );
}
