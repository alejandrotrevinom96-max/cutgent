"use client";

import { useEffect, useState } from "react";
import { X, KeyRound, Check } from "lucide-react";

/**
 * Ajustes del dueño: API keys de stock (bring-your-own). Se guardan en
 * userData/settings.json vía /api/settings; nunca se muestran en claro.
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<{
    pexels: { set: boolean; masked: string };
    pixabay: { set: boolean; masked: string };
  } | null>(null);
  const [pexelsKey, setPexelsKey] = useState("");
  const [pixabayKey, setPixabayKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setPexelsKey("");
    setPixabayKey("");
    void fetch("/api/settings")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(pexelsKey ? { pexelsKey } : {}),
          ...(pixabayKey ? { pixabayKey } : {}),
        }),
      });
      setSaved(true);
      const r = await fetch("/api/settings");
      setStatus(await r.json());
      setPexelsKey("");
      setPixabayKey("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <KeyRound size={18} className="text-accent" />
          <h2 className="flex-1 text-sm font-semibold text-text">Ajustes · API keys</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-[11px] leading-relaxed text-muted">
          Cutgent usa TUS cuentas. Pega tus API keys (gratuitas) para buscar stock. Se guardan solo
          en tu equipo. Pexels: pexels.com/api · Pixabay: pixabay.com/api/docs.
        </p>

        <KeyField
          label="Pexels API key"
          status={status?.pexels}
          value={pexelsKey}
          onChange={setPexelsKey}
        />
        <KeyField
          label="Pixabay API key"
          status={status?.pixabay}
          value={pixabayKey}
          onChange={setPixabayKey}
        />

        <div className="mt-5 flex items-center justify-end gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-[var(--ok)]">
              <Check size={14} /> Guardado
            </span>
          )}
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-xs text-muted hover:text-text">
            Cerrar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || (!pexelsKey && !pixabayKey)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-2 disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyField({
  label,
  status,
  value,
  onChange,
}: {
  label: string;
  status?: { set: boolean; masked: string };
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mb-3 flex flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] font-medium text-muted">
        {label}
        {status?.set && <span className="font-mono text-[10px] text-[var(--ok)]">{status.masked}</span>}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={status?.set ? "Pegar para reemplazar…" : "Pega tu API key"}
        className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
      />
    </label>
  );
}
