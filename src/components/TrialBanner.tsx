"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { PRICING, openBuy } from "@/lib/pricing";

/**
 * Barra delgada NO bloqueante de "modo de prueba". Aparece cuando no hay licencia
 * válida (las exportaciones llevan marca de agua). No persiste el cierre: vuelve
 * a recordar suavemente al reabrir la app. La verificación real es server-side;
 * esto es solo el aviso + accesos a comprar / activar.
 */
export function TrialBanner() {
  const [licensed, setLicensed] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setLicensed(!!s?.license?.licensed))
      .catch(() => setLicensed(null));
  }, []);

  useEffect(() => {
    check();
    const onChange = () => check();
    window.addEventListener("cutgent:license-changed", onChange);
    return () => window.removeEventListener("cutgent:license-changed", onChange);
  }, [check]);

  // Solo se muestra si sabemos con certeza que NO hay licencia.
  if (licensed !== false || dismissed) return null;

  return (
    <div className="flex items-center gap-3 border-b border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-1.5 text-[11px] text-text">
      <span className="flex-1">
        <span className="font-semibold">Modo de prueba</span> — tus exportaciones llevan marca de agua.
      </span>
      <button
        type="button"
        onClick={() => openBuy(PRICING.early.url)}
        className="rounded-md bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-2"
        title={`Licencia early adopter — $${PRICING.early.priceUsd} (${PRICING.early.note})`}
      >
        Comprar ${PRICING.early.priceUsd}
      </button>
      <button
        type="button"
        onClick={() => openBuy(PRICING.standard.url)}
        className="rounded-md border border-border px-2.5 py-1 text-muted hover:text-text"
        title={`Licencia standard — $${PRICING.standard.priceUsd}`}
      >
        Standard ${PRICING.standard.priceUsd}
      </button>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("cutgent:open-license"))}
        className="text-muted underline-offset-2 hover:text-text hover:underline"
      >
        Ya tengo licencia
      </button>
      <button type="button" onClick={() => setDismissed(true)} title="Ocultar" className="text-muted hover:text-text">
        <X size={14} />
      </button>
    </div>
  );
}
