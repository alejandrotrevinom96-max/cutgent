"use client";

import { useEffect, useState } from "react";
import { X, KeyRound, Check, Plus, Trash2, Plug } from "lucide-react";

type KeyStatus = { set: boolean; masked: string };
type Status = {
  pexels: KeyStatus;
  pixabay: KeyStatus;
  whisperModel: string;
  keys: Record<string, KeyStatus>;
};

/** Proveedores sugeridos (un clic los precarga). El usuario puede añadir CUALQUIER otro. */
const SUGGESTIONS: { name: string; label: string }[] = [
  { name: "GEMINI_API_KEY", label: "Google AI Studio" },
  { name: "OPENAI_API_KEY", label: "OpenAI" },
  { name: "HIGGSFIELD_API_KEY", label: "Higgsfield" },
  { name: "REPLICATE_API_TOKEN", label: "Replicate" },
  { name: "FAL_KEY", label: "fal.ai" },
  { name: "ELEVENLABS_API_KEY", label: "ElevenLabs" },
];

/**
 * Ajustes del dueño (bring-your-own): API keys de stock + un VAULT abierto de
 * llaves arbitrarias (cualquier proveedor de IA). Se guardan en
 * userData/data/settings.json vía /api/settings; nunca se muestran en claro.
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [pexelsKey, setPexelsKey] = useState("");
  const [pixabayKey, setPixabayKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = () => fetch("/api/settings").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setPexelsKey("");
    setPixabayKey("");
    setNewName("");
    setNewValue("");
    void refresh();
  }, [open]);

  if (!open) return null;

  const post = async (body: unknown) => {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await refresh();
  };

  const saveStock = async () => {
    setSaving(true);
    try {
      await post({ ...(pexelsKey ? { pexelsKey } : {}), ...(pixabayKey ? { pixabayKey } : {}) });
      setSaved(true);
      setPexelsKey("");
      setPixabayKey("");
    } finally {
      setSaving(false);
    }
  };

  const addKey = async () => {
    const name = newName.trim().toUpperCase();
    if (!name || !newValue.trim()) return;
    setSaving(true);
    try {
      await post({ keys: { [name]: newValue.trim() } });
      setNewName("");
      setNewValue("");
    } finally {
      setSaving(false);
    }
  };

  const removeKey = (name: string) => void post({ keys: { [name]: "" } });

  const customKeys = Object.entries(status?.keys ?? {});

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border p-5 pb-4">
          <KeyRound size={18} className="text-accent" />
          <h2 className="flex-1 text-sm font-semibold text-text">Ajustes · API keys</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Stock */}
          <p className="mb-3 text-[11px] leading-relaxed text-muted">
            Cutgent usa TUS cuentas. Las llaves se guardan SOLO en tu equipo. Para buscar stock pega tus keys gratuitas
            (Pexels: pexels.com/api · Pixabay: pixabay.com/api/docs).
          </p>
          <KeyField label="Pexels API key" status={status?.pexels} value={pexelsKey} onChange={setPexelsKey} />
          <KeyField label="Pixabay API key" status={status?.pixabay} value={pixabayKey} onChange={setPixabayKey} />
          <div className="mb-5 mt-2 flex items-center justify-end gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-[var(--ok)]">
                <Check size={14} /> Guardado
              </span>
            )}
            <button
              type="button"
              onClick={saveStock}
              disabled={saving || (!pexelsKey && !pixabayKey)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-2 disabled:opacity-40"
            >
              {saving ? "Guardando…" : "Guardar stock"}
            </button>
          </div>

          {/* Integraciones abiertas (BYO cualquier proveedor) */}
          <div className="mb-2 flex items-center gap-2 border-t border-border pt-4">
            <Plug size={15} className="text-accent" />
            <h3 className="text-xs font-semibold text-text">Integraciones · cualquier API key</h3>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-muted">
            Conecta CUALQUIER proveedor (Google AI Studio, Higgsfield, OpenAI, Replicate, fal, ElevenLabs…). Quedan
            disponibles como variables de entorno para tu IA y para integraciones futuras. El editor queda abierto.
          </p>

          {/* keys ya configuradas */}
          {customKeys.length > 0 && (
            <div className="mb-3 flex flex-col gap-1.5">
              {customKeys.map(([name, st]) => (
                <div key={name} className="flex items-center gap-2 rounded-md border border-border bg-panel-2 px-2.5 py-1.5">
                  <span className="flex-1 truncate font-mono text-[11px] text-text">{name}</span>
                  <span className="font-mono text-[10px] text-[var(--ok)]">{st.masked}</span>
                  <button type="button" onClick={() => removeKey(name)} title="Quitar" className="text-muted hover:text-[var(--danger,#e5484d)]">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* sugerencias */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setNewName(s.name)}
                className="rounded-full border border-border bg-panel-2 px-2.5 py-1 text-[10px] text-muted hover:border-accent hover:text-text"
                title={s.name}
              >
                + {s.label}
              </button>
            ))}
          </div>

          {/* añadir nueva */}
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="NOMBRE_DE_LA_LLAVE (ej. GEMINI_API_KEY)"
              className="w-full rounded-md border border-border bg-panel-2 px-2 py-1.5 font-mono text-xs uppercase text-text outline-none focus:border-accent"
            />
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addKey(); }}
                placeholder="Pega el valor de la API key"
                className="flex-1 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={addKey}
                disabled={saving || !newName.trim() || !newValue.trim()}
                className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-2 disabled:opacity-40"
              >
                <Plus size={14} /> Añadir
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-border p-4">
          <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-xs text-muted hover:text-text">
            Cerrar
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
  status?: KeyStatus;
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
