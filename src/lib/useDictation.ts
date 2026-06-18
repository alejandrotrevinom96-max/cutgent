"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictado por voz para notas — 100% local. Graba audio del micro con
 * MediaRecorder y lo envía a /api/dictate, que lo transcribe con el MISMO
 * Whisper local del resto de la app (nada sale a la nube; respeta "own-it").
 *
 * Es una CAPA DE ENTRADA: la voz se convierte en TEXTO de nota, no en control
 * directo del editor. El usuario revisa el texto antes de que el asistente lo
 * aplique (patrón "anotar → revisar → aplicar").
 */

export type DictationState = "idle" | "recording" | "transcribing" | "error";

export interface UseDictation {
  state: DictationState;
  error: string | null;
  /** true si el navegador soporta captura de micro + MediaRecorder. */
  supported: boolean;
  start: () => Promise<void>;
  /** Detiene la grabación, transcribe y resuelve con el texto (o "" si vacío). */
  stop: () => Promise<string>;
  /** Cancela sin transcribir. */
  cancel: () => void;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function useDictation(opts: { language?: string } = {}): UseDictation {
  const [state, setState] = useState<DictationState>("idle");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stoppedRef = useRef<((b: Blob | null) => void) | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    chunksRef.current = [];
    stoppedRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError("Tu navegador no soporta captura de micrófono.");
      setState("error");
      return;
    }
    if (recRef.current) return; // ya grabando
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
          : null;
        stoppedRef.current?.(blob);
      };
      recRef.current = rec;
      rec.start();
      setState("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo acceder al micrófono.");
      setState("error");
      cleanup();
    }
  }, [supported, cleanup]);

  const stop = useCallback(async (): Promise<string> => {
    const rec = recRef.current;
    if (!rec) return "";
    const blob = await new Promise<Blob | null>((resolve) => {
      stoppedRef.current = resolve;
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
    cleanup();
    if (!blob || blob.size < 1024) {
      setState("idle");
      return "";
    }
    setState("transcribing");
    try {
      const fd = new FormData();
      fd.append("audio", blob, "dictation.webm");
      if (opts.language) fd.append("language", opts.language);
      const res = await fetch("/api/dictate", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { text?: string };
      setState("idle");
      return (data.text ?? "").trim();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallo al transcribir.");
      setState("error");
      return "";
    }
  }, [cleanup, opts.language]);

  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      stoppedRef.current = () => {};
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    cleanup();
    setState("idle");
  }, [cleanup]);

  // Libera el micro si el componente se desmonta a mitad de grabación.
  useEffect(() => cancel, [cancel]);

  return { state, error, supported, start, stop, cancel };
}
