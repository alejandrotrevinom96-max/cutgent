"use client";

import { useEffect, useState } from "react";
import { Clapperboard, Bot, Upload, Wand2, X } from "lucide-react";

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
          <Clapperboard size={22} className="text-accent" />
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
            title="Conecta tu IA (MCP)"
            body="Menú «IA / MCP → Copiar configuración para conectar mi IA» y pégala en tu cliente (Claude Desktop / Code). Reinícialo y deja Cutgent abierto: tu IA podrá editar por ti."
          />
          <Step
            icon={<Upload size={18} />}
            n={2}
            title="Trae tus medios"
            body="Sube archivos, pega una URL, o busca stock (Pexels/Pixabay) — para stock añade tus API keys gratuitas en «Ajustes»."
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

function Step({ icon, n, title, body }: { icon: React.ReactNode; n: number; title: string; body: string }) {
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
