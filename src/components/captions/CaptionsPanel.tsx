"use client";

import { useState } from "react";
import { Captions, Sparkles, Plus, Wand2, Loader2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { createClip, createTrack } from "@/lib/factory";
import type { Clip } from "@/lib/schema";
import {
  parseSRT,
  parseVTT,
  cuesToClipInputs,
  CAPTION_PRESETS,
  type Cue,
} from "@/lib/captions";
import type { Command } from "@/lib/commands";

/**
 * Panel de subtítulos: pega SRT/VTT o texto plano y genera clips de texto en una
 * pista "Subtítulos". Todo se envía en un único lote vía runCommands.
 */

type Mode = "srtvtt" | "plain";
type Preset = keyof typeof CAPTION_PRESETS;

const PRESETS: readonly { value: Preset; label: string }[] = [
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "minimal", label: "Minimal" },
  { value: "bold", label: "Bold" },
];

/** Construye cues secuenciales a partir de líneas no vacías de texto plano. */
function plainTextToCues(
  text: string,
  secondsPerLine: number,
  offsetSec: number,
): Cue[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const dur = secondsPerLine > 0 ? secondsPerLine : 2.5;

  return lines.map((line, i) => {
    const startSec = offsetSec + i * dur;
    return {
      index: i + 1,
      startSec,
      endSec: startSec + dur,
      text: line,
    };
  });
}

/** Clip de video/audio con `src` (los únicos transcribibles). */
type SourceClip = Extract<Clip, { type: "video" | "audio" }>;

/** ¿Es un clip transcribible (video/audio con src)? */
function isSourceClip(clip: Clip): clip is SourceClip {
  return (clip.type === "video" || clip.type === "audio") && typeof (clip as SourceClip).src === "string";
}

/** Formatea segundos a "HH:MM:SS,mmm" (timestamp SRT). */
function secondsToSrtStamp(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Construye un texto SRT a partir de los segmentos de un transcript. Los tiempos
 * del transcript son relativos a la FUENTE; `offsetSec` los reubica en la línea
 * de tiempo (start del clip menos su trimStart, ambos en segundos).
 */
function segmentsToSrt(
  segments: { start: number; end: number; text: string }[],
  offsetSec: number,
): string {
  return segments
    .map((seg, i) => {
      const start = secondsToSrtStamp(seg.start + offsetSec);
      const end = secondsToSrtStamp(seg.end + offsetSec);
      return `${i + 1}\n${start} --> ${end}\n${seg.text.trim()}`;
    })
    .join("\n\n");
}

export function CaptionsPanel() {
  const document = useEditor((s) => s.document);
  const currentFrame = useEditor((s) => s.currentFrame);
  const runCommands = useEditor((s) => s.runCommands);
  const selectedClipId = useEditor((s) => s.selectedClipId);

  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<Mode>("srtvtt");
  const [secondsPerLine, setSecondsPerLine] = useState(2.5);
  const [preset, setPreset] = useState<Preset>("youtube");
  const [animated, setAnimated] = useState(false);
  const [status, setStatus] = useState<
    { kind: "ok"; count: number } | { kind: "error"; message: string } | null
  >(null);
  // Estado de la auto-transcripción (separado del `status` de generación).
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeMsg, setTranscribeMsg] = useState<string | null>(null);

  /**
   * Auto-transcribe: toma el clip de video/audio seleccionado (o el primero del
   * documento con audio) y llama a /api/transcribe. Rellena la caja de texto con
   * SRT reubicado a la posición del clip en la línea de tiempo; luego el flujo
   * normal de "Generar subtítulos" crea los clips. Errores siempre visibles.
   */
  async function handleAutoTranscribe(): Promise<void> {
    if (transcribing) return;
    setStatus(null);

    // 1) Elegir clip fuente: el seleccionado si es transcribible; si no, el primero.
    let chosen: SourceClip | null = null;
    if (selectedClipId) {
      for (const t of document.tracks) {
        const c = t.clips.find((x) => x.id === selectedClipId);
        if (c && isSourceClip(c)) {
          chosen = c;
          break;
        }
      }
    }
    if (!chosen) {
      outer: for (const t of document.tracks) {
        for (const c of t.clips) {
          if (isSourceClip(c)) {
            chosen = c;
            break outer;
          }
        }
      }
    }
    if (!chosen) {
      setStatus({
        kind: "error",
        message: "Selecciona un clip de video o audio (o añade uno) para transcribir.",
      });
      return;
    }

    const fps = document.fps;
    // Offset del transcript (relativo a la fuente) → línea de tiempo.
    const offsetSec = (chosen.start - (chosen.trimStart ?? 0)) / fps;

    setTranscribing(true);
    setTranscribeMsg("Transcribiendo… (puede tardar en videos largos)");
    try {
      let res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src: chosen.src }),
      });
      let data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error ${res.status} al transcribir.`);

      // Idioma ambiguo: reintenta con el candidato más probable (no bloqueamos al usuario).
      if (data?.status === "needs_language") {
        const lang = data?.detection?.top?.[0]?.language;
        if (!lang) throw new Error("No se pudo detectar el idioma del audio.");
        res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ src: chosen.src, language: lang }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Error ${res.status} al transcribir.`);
      }

      // Job en segundo plano: hacemos polling hasta done/error.
      if (data?.status === "running" && data?.jobId) {
        const jobId: string = data.jobId;
        const deadline = Date.now() + 10 * 60 * 1000; // tope 10 min
        for (;;) {
          if (Date.now() > deadline) throw new Error("La transcripción tardó demasiado.");
          await new Promise((r) => setTimeout(r, 2000));
          const poll = await fetch(`/api/transcribe?id=${encodeURIComponent(jobId)}`);
          const pj = await poll.json();
          if (!poll.ok || pj?.status === "error") {
            throw new Error(pj?.error || "El job de transcripción falló.");
          }
          if (pj?.status === "done") {
            data = pj;
            break;
          }
        }
      }

      const segments = data?.transcript?.segments;
      if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error("La transcripción no devolvió texto.");
      }

      // 2) Volcar como SRT y dejar listo el flujo manual de generación.
      setMode("srtvtt");
      setRaw(segmentsToSrt(segments, offsetSec));
      setTranscribeMsg(
        `Transcripción lista (${segments.length} segmentos). Revisa y pulsa «Generar subtítulos».`,
      );
    } catch (err) {
      setTranscribeMsg(null);
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTranscribing(false);
    }
  }

  function handleGenerate(): void {
    const content = raw.trim();
    if (!content) {
      setStatus({ kind: "error", message: "Pega o escribe el texto primero." });
      return;
    }

    const fps = document.fps;

    // 1) Construir cues según el modo.
    let cues: Cue[];
    if (mode === "srtvtt") {
      cues = /WEBVTT/.test(content) ? parseVTT(content) : parseSRT(content);
    } else {
      const offsetSec = currentFrame / fps;
      cues = plainTextToCues(content, secondsPerLine, offsetSec);
    }

    if (cues.length === 0) {
      setStatus({
        kind: "error",
        message:
          mode === "srtvtt"
            ? "No se pudo parsear ningún subtítulo. Revisa el formato SRT/VTT."
            : "No hay líneas de texto para generar.",
      });
      return;
    }

    // 2) Convertir cues a inputs de clip de texto.
    const inputs = cuesToClipInputs(cues, { fps, preset, animated });

    // 3) Asegurar pista "Subtítulos" (crearla la primera si no existe).
    const existing = document.tracks.find((t) => t.name === "Subtítulos");
    const commands: Command[] = [];
    let trackId: string;

    if (existing) {
      trackId = existing.id;
    } else {
      const track = createTrack({ name: "Subtítulos", kind: "media" });
      trackId = track.id;
      commands.push({ type: "add_track", track });
    }

    // 4) Un comando add_clip por cada input.
    for (const input of inputs) {
      const clip = createClip("text", input);
      commands.push({ type: "add_clip", trackId, clip });
    }

    // 5) Enviar todo en un único lote.
    void runCommands(commands);
    setStatus({ kind: "ok", count: inputs.length });
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col overflow-y-auto border-l border-border bg-panel text-text">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <Captions size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text">Subtítulos</h2>
      </div>

      <section className="flex flex-col gap-3 p-3">
        {/* Auto-transcripción (Whisper local vía /api/transcribe) */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => void handleAutoTranscribe()}
            disabled={transcribing}
            className="flex items-center justify-center gap-1.5 rounded-md border border-accent bg-panel-2 px-3 py-2 text-xs font-medium text-accent transition hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {transcribing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Wand2 size={14} />
            )}
            {transcribing ? "Transcribiendo…" : "Auto-transcribir clip"}
          </button>
          {transcribeMsg && (
            <p className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-[11px] leading-relaxed text-muted">
              {transcribeMsg}
            </p>
          )}
        </div>

        {/* Modo */}
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Modo
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("srtvtt")}
              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                mode === "srtvtt"
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-panel-2 text-muted hover:text-text"
              }`}
            >
              SRT/VTT
            </button>
            <button
              type="button"
              onClick={() => setMode("plain")}
              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                mode === "plain"
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-panel-2 text-muted hover:text-text"
              }`}
            >
              Texto simple
            </button>
          </div>
        </div>

        {/* Entrada de texto */}
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {mode === "srtvtt" ? "Pega SRT o VTT" : "Una línea por subtítulo"}
          </p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={10}
            placeholder={
              mode === "srtvtt"
                ? "1\n00:00:00,000 --> 00:00:02,500\nHola mundo\n\n2\n00:00:02,500 --> 00:00:05,000\n…"
                : "Primera frase\nSegunda frase\nTercera frase"
            }
            className="w-full resize-y rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs leading-snug text-text outline-none focus:border-accent"
          />
        </div>

        {/* Segundos por línea (solo texto simple) */}
        {mode === "plain" && (
          <label className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Segundos por línea</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={secondsPerLine}
              onChange={(e) => setSecondsPerLine(Number(e.target.value))}
              className="w-20 rounded-md border border-border bg-panel-2 px-2 py-1 text-sm text-text outline-none focus:border-accent"
            />
          </label>
        )}

        {/* Preset de estilo */}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Estilo
          </span>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
            className="w-full cursor-pointer rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {/* Animado (karaoke) */}
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={animated}
            onChange={(e) => setAnimated(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          <span className="text-xs text-muted">
            Animado (karaoke, resalta palabra por palabra)
          </span>
        </label>

        {/* Generar */}
        <button
          type="button"
          onClick={handleGenerate}
          className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-accent-2"
        >
          <Sparkles size={14} /> Generar subtítulos
        </button>

        {/* Estado */}
        {status?.kind === "ok" && (
          <p className="flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-[11px] text-accent-2">
            <Plus size={13} /> Se añadieron {status.count}{" "}
            {status.count === 1 ? "subtítulo" : "subtítulos"} a la pista
            «Subtítulos».
          </p>
        )}
        {status?.kind === "error" && (
          <p className="rounded-md border border-[var(--danger,#ef4444)] bg-panel-2 px-2 py-1.5 text-[11px] text-[var(--danger,#ef4444)]">
            {status.message}
          </p>
        )}

        <p className="text-[11px] leading-relaxed text-muted">
          Los subtítulos se colocan a partir del frame actual (texto simple) o
          según sus tiempos (SRT/VTT) usando {document.fps} fps.
        </p>
      </section>
    </aside>
  );
}
