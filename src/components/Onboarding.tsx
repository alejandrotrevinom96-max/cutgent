"use client";

import { useEffect, useState } from "react";
import { Bot, Upload, Wand2, X } from "lucide-react";
import { CutgentMark } from "./Logo";

const KEY = "cutgent-onboarded-v1";

/**
 * Primer arranque: explica qué es Cutgent y los 3 pasos para empezar (conectar
 * la IA por MCP, traer medios con tus keys, y editar). Se muestra una sola vez
 * (flag en localStorage). Sin esto, un comprador abre a un editor vacío sin
 * saber que el diferenciador es el control por IA.
 */
export function Onboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-panel p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <CutgentMark size={24} />
          <h2 className="flex-1 text-lg font-bold text-text">Bienvenido a Cutgent</h2>
          <button type="button" onClick={close} className="text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-muted">
          Un editor de video que controlas con tu propia IA. Tres pasos para empezar:
        </p>

        <ol className="flex flex-col gap-3">
          <Step
            icon={<Bot size={18} />}
            n={1}
            title="Habla con tu IA — sin instalar nada"
            body={
              <ol className="mt-1 flex list-none flex-col gap-1.5">
                <SubStep>
                  Abre el botón <b className="text-text">✨ asistente</b> (abajo a la derecha).
                </SubStep>
                <SubStep>
                  Pega tu <b className="text-text">API key de Claude</b> una sola vez (se guarda solo en tu equipo).
                </SubStep>
                <SubStep>
                  Pídele lo que quieras —«añade un título», «pon subtítulos», «corta los silencios»— y lo verás aparecer en vivo.
                </SubStep>
              </ol>
            }
          />
          <Step
            icon={<Upload size={18} />}
            n={2}
            title="Trae tus medios"
            body="Sube archivos, pega una URL, o busca stock. En «Ajustes» pones tus API keys: Pexels/Pixabay para stock, y CUALQUIER proveedor de IA (Google AI Studio, Higgsfield, OpenAI…) para generar."
          />
          <Step
            icon={<Wand2 size={18} />}
            n={3}
            title="Edita"
            body="Pídele a tu IA que corte, ponga subtítulos, color, transiciones… o hazlo a mano. Exporta a MP4/ProRes/WebM/GIF cuando termines."
          />
        </ol>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={close}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-2"
          >
            Empezar
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ icon, n, title, body }: { icon: React.ReactNode; n: number; title: string; body: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-accent">
        {icon}
      </span>
      <div>
        <div className="text-sm font-semibold text-text">
          {n}. {title}
        </div>
        <div className="text-xs leading-relaxed text-muted">{body}</div>
      </div>
    </li>
  );
}

function SubStep({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-xs leading-relaxed text-muted">
      <span className="select-none text-accent">▸</span>
      <span>{children}</span>
    </li>
  );
}
