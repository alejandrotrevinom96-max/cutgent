"use client";

import { useState } from "react";
import { Captions, Sparkles, Plus } from "lucide-react";
import { useEditor } from "@/lib/store";
import { createClip, createTrack } from "@/lib/factory";
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

export function CaptionsPanel() {
  const document = useEditor((s) => s.document);
  const currentFrame = useEditor((s) => s.currentFrame);
  const runCommands = useEditor((s) => s.runCommands);

  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<Mode>("srtvtt");
  const [secondsPerLine, setSecondsPerLine] = useState(2.5);
  const [preset, setPreset] = useState<Preset>("youtube");
  const [animated, setAnimated] = useState(false);
  const [status, setStatus] = useState<
    { kind: "ok"; count: number } | { kind: "error"; message: string } | null
  >(null);

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
