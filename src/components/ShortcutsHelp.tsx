"use client";

import { useEffect } from "react";
import { X, Keyboard } from "lucide-react";

/**
 * Overlay de ayuda con TODOS los atajos de teclado reales (ver el handler global
 * en src/app/page.tsx). Estilo consistente con SettingsModal: modal centrado,
 * cierra con Escape o clic fuera. ¿es macOS? muestra ⌘ en vez de Ctrl.
 */

// Detecta macOS para mostrar la tecla modificadora correcta.
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

type Shortcut = { keys: string[]; desc: string };
type Group = { title: string; items: Shortcut[] };

const GROUPS: Group[] = [
  {
    title: "Reproducción",
    items: [
      { keys: ["Espacio"], desc: "Reproducir / pausar" },
      { keys: ["L"], desc: "Reproducir" },
      { keys: ["K"], desc: "Pausar" },
      { keys: ["J"], desc: "Pausar y retroceder ~1s" },
      { keys: ["←", "→"], desc: "Frame anterior / siguiente" },
      { keys: ["Shift", "←/→"], desc: "Saltar ~1s" },
      { keys: ["Inicio"], desc: "Ir al principio" },
      { keys: ["Fin"], desc: "Ir al final" },
    ],
  },
  {
    title: "Edición",
    items: [
      { keys: [MOD, "Z"], desc: "Deshacer" },
      { keys: [MOD, "Shift", "Z"], desc: "Rehacer" },
      { keys: [MOD, "Y"], desc: "Rehacer (alternativo)" },
      { keys: [MOD, "C"], desc: "Copiar clip seleccionado" },
      { keys: [MOD, "V"], desc: "Pegar clip" },
      { keys: [MOD, "D"], desc: "Duplicar clip" },
      { keys: ["S"], desc: "Cortar (split) en el playhead" },
      { keys: [MOD, "B"], desc: "Cortar (split) — alternativo" },
      { keys: ["Supr", "Retroceso"], desc: "Borrar clip seleccionado" },
      { keys: ["Shift", "Supr"], desc: "Borrar con ripple (cierra el hueco)" },
      { keys: [MOD, "A"], desc: "Seleccionar todos los clips" },
      { keys: [MOD, "S"], desc: "Guardar versión (snapshot)" },
    ],
  },
  {
    title: "Marcado y notas",
    items: [
      { keys: ["I"], desc: "Marcar entrada (in) del rango — luego «Exportar rango»" },
      { keys: ["O"], desc: "Marcar salida (out) del rango — luego «Exportar rango»" },
      { keys: ["M"], desc: "Añadir capítulo / marcador" },
      { keys: ["N"], desc: "Añadir nota de edición" },
      { keys: ["V"], desc: "Mantener para dictar una nota por voz" },
    ],
  },
  {
    title: "Vista",
    items: [
      { keys: ["+", "="], desc: "Acercar (zoom) la línea de tiempo" },
      { keys: ["-"], desc: "Alejar (zoom) la línea de tiempo" },
      { keys: ["?"], desc: "Mostrar / ocultar esta ayuda" },
    ],
  },
];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Cerrar con Escape mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Atajos de teclado"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border p-5 pb-4">
          <Keyboard size={18} className="text-accent" />
          <h2 className="flex-1 text-sm font-semibold text-text">Atajos de teclado</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-5 overflow-y-auto p-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-[12px] text-text">
                    <span className="min-w-0 flex-1 truncate text-muted">{s.desc}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="rounded border border-border bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-text shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border p-4">
          <span className="text-[11px] text-muted">
            Los atajos se ignoran mientras escribes en un campo de texto.
          </span>
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-xs text-muted hover:text-text">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
