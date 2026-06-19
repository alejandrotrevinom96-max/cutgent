"use client";

import { useEffect, useRef } from "react";
import { useEditor } from "@/lib/store";
import { useDictation } from "@/lib/useDictation";
import { TopBar } from "@/components/TopBar";
import { MediaPanel } from "@/components/media/MediaPanel";
import { CaptionsPanel } from "@/components/captions/CaptionsPanel";
import { TitlesPanel } from "@/components/titles/TitlesPanel";
import { NotesPanel } from "@/components/notes/NotesPanel";
import { NoteComposer } from "@/components/notes/NoteComposer";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { Inspector } from "@/components/inspector/Inspector";
import { ClipperView } from "@/components/clipper/ClipperView";
import { Onboarding } from "@/components/Onboarding";
import { TrialBanner } from "@/components/TrialBanner";

export default function EditorPage() {
  const connect = useEditor((s) => s.connect);
  const view = useEditor((s) => s.view);

  // Dictado de notas push-to-talk (mantener V). Refs para un listener estable.
  const dictation = useDictation();
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;
  const pttActive = useRef(false);
  const pttFrame = useRef(0);

  // Pull the authoritative document and subscribe to live (MCP / multi-tab)
  // changes once, on mount.
  useEffect(() => {
    connect();
  }, [connect]);

  // Atajos globales (deshacer/rehacer, portapapeles, notas, dictado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        void s.undo();
      } else if (mod && ((k === "z" && e.shiftKey) || k === "y")) {
        e.preventDefault();
        void s.redo();
      } else if (mod && k === "c") {
        e.preventDefault();
        s.copySelectedClip();
      } else if (mod && k === "v") {
        e.preventDefault();
        s.pasteClip();
      } else if (mod && k === "d") {
        e.preventDefault();
        const id = s.selectedClipId;
        if (id) void s.runCommand({ type: "duplicate_clip", clipId: id, newId: `clip_${Math.random().toString(36).slice(2, 10)}` });
      } else if (!mod && k === "n") {
        // Nota de edición en el frame actual.
        e.preventDefault();
        s.openNoteComposer();
      } else if (!mod && k === "m") {
        // Capítulo/marcador clásico en el frame actual.
        e.preventDefault();
        s.addChapter();
      } else if (!mod && k === "v" && !e.repeat) {
        // Mantener V = dictar una nota por voz (push-to-talk). Solo con el
        // compositor cerrado para no chocar con su propio micrófono.
        if (s.noteDraftFrame == null && dictationRef.current.supported && !pttActive.current) {
          e.preventDefault();
          pttActive.current = true;
          pttFrame.current = s.currentFrame;
          s.setPlaying(false);
          void dictationRef.current.start();
        }
      } else if (!mod && e.code === "Space") {
        if (e.repeat) return;
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (!mod && k === "k") {
        if (e.repeat) return;
        e.preventDefault();
        s.setPlaying(false);
      } else if (!mod && k === "l") {
        if (e.repeat) return;
        e.preventDefault();
        s.setPlaying(true);
      } else if (!mod && k === "j") {
        // Sin reverse nativo en el Player: pausa + retrocede ~1s (lite).
        if (e.repeat) return;
        e.preventDefault();
        s.setPlaying(false);
        s.setCurrentFrame(Math.max(0, s.currentFrame - Math.round(s.document.fps)));
      } else if (k === "arrowleft") {
        e.preventDefault();
        s.setCurrentFrame(Math.max(0, s.currentFrame - (e.shiftKey ? Math.round(s.document.fps) : 1)));
      } else if (k === "arrowright") {
        e.preventDefault();
        const max = Math.max(0, s.document.durationInFrames - 1);
        s.setCurrentFrame(Math.min(max, s.currentFrame + (e.shiftKey ? Math.round(s.document.fps) : 1)));
      } else if (k === "home") {
        e.preventDefault();
        s.setCurrentFrame(0);
      } else if (k === "end") {
        e.preventDefault();
        s.setCurrentFrame(Math.max(0, s.document.durationInFrames - 1));
      } else if (!mod && k === "i") {
        e.preventDefault();
        s.setInFrame(s.currentFrame);
      } else if (!mod && k === "o") {
        e.preventDefault();
        s.setOutFrame(s.currentFrame);
      } else if (!mod && (k === "+" || k === "=")) {
        e.preventDefault();
        s.setPixelsPerFrame(s.pixelsPerFrame * 1.2);
      } else if (!mod && k === "-") {
        e.preventDefault();
        s.setPixelsPerFrame(s.pixelsPerFrame / 1.2);
      } else if (k === "delete" || k === "backspace") {
        e.preventDefault();
        s.deleteSelectedClip(e.shiftKey);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "v" && pttActive.current) {
        pttActive.current = false;
        void dictationRef.current.stop().then((text) => {
          if (text) useEditor.getState().addNote(text, { frame: pttFrame.current, source: "voice" });
        });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-bg text-text">
      <Onboarding />
      <TrialBanner />
      <TopBar />
      {view === "clipper" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ClipperView />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r border-border bg-panel">
            <MediaPanel />
            <CaptionsPanel />
            <TitlesPanel />
            <NotesPanel />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 bg-black">
              <PreviewPanel />
              <NoteComposer />
              {(dictation.state === "recording" || dictation.state === "transcribing") &&
                useEditor.getState().noteDraftFrame == null && (
                  <div className="pointer-events-none absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-border bg-panel/95 px-3 py-1 text-xs shadow-lg backdrop-blur">
                    {dictation.state === "recording" ? (
                      <span className="text-[var(--danger)]">● Grabando nota… (suelta V)</span>
                    ) : (
                      <span className="text-[var(--info)]">Transcribiendo localmente…</span>
                    )}
                  </div>
                )}
            </div>
            <div className="h-[320px] shrink-0 overflow-hidden border-t border-border bg-panel">
              <Timeline />
            </div>
          </main>

          <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-border bg-panel">
            <Inspector />
          </aside>
        </div>
      )}
    </div>
  );
}
