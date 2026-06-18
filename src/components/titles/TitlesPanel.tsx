"use client";

import { useState } from "react";
import { Type, Plus } from "lucide-react";
import { useEditor } from "@/lib/store";
import { createClip, createTrack } from "@/lib/factory";
import { TITLE_TEMPLATE_LIST, buildTitleInputs, type TitleTemplateId } from "@/lib/titleTemplates";
import type { Command } from "@/lib/commands";
import type { ClipType } from "@/lib/schema";

/**
 * Panel de plantillas de títulos animados. Elige plantilla + escribe el texto y
 * se insertan en el frame actual como clips (texto/forma) ya animados, en una
 * pista "Títulos". Todo en un único lote atómico (runCommands).
 */
export function TitlesPanel() {
  const document = useEditor((s) => s.document);
  const currentFrame = useEditor((s) => s.currentFrame);
  const runCommands = useEditor((s) => s.runCommands);

  const [templateId, setTemplateId] = useState<TitleTemplateId>("lower-third");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const insert = () => {
    const content = text.trim() || "Texto";
    const inputs = buildTitleInputs(templateId, content, {
      fps: document.fps,
      width: document.width,
      height: document.height,
    });
    if (inputs.length === 0) {
      setStatus({ ok: false, msg: "Plantilla no válida." });
      return;
    }

    const existing = document.tracks.find((t) => t.name === "Títulos");
    const commands: Command[] = [];
    let trackId: string;
    if (existing) {
      trackId = existing.id;
    } else {
      const track = createTrack({ name: "Títulos", kind: "media" });
      trackId = track.id;
      commands.push({ type: "add_track", track });
    }

    for (const input of inputs) {
      const { kind, start, duration, ...rest } = input;
      const clip = createClip(kind as ClipType, {
        start: currentFrame + start,
        duration,
        ...rest,
      });
      commands.push({ type: "add_clip", trackId, clip });
    }

    void runCommands(commands);
    setStatus({ ok: true, msg: `Insertado en el frame ${currentFrame}.` });
  };

  return (
    <section className="flex w-full flex-col border-t border-border bg-panel text-text">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <Type size={16} className="text-accent" />
        <h2 className="text-sm font-semibold">Títulos</h2>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Plantilla
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {TITLE_TEMPLATE_LIST.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                  templateId === t.id
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-panel-2 text-muted hover:text-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Texto del título…"
          className="w-full resize-y rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
        />

        <button
          type="button"
          onClick={insert}
          className="flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-accent-2"
        >
          <Plus size={14} /> Insertar en el frame actual
        </button>

        {status && (
          <p className={`text-[11px] ${status.ok ? "text-accent-2" : "text-[var(--danger)]"}`}>{status.msg}</p>
        )}
      </div>
    </section>
  );
}
