"use client";

import { useEffect, useId, useState } from "react";

/**
 * Inputs reutilizables para el Inspector.
 * Todos son CONTROLADOS: reciben `value` del clip y emiten `onChange`.
 * Los campos numéricos/texto usan un buffer local para permitir editar
 * libremente y confirman en blur / Enter, evitando spamear comandos.
 */

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function FieldRow({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="grid grid-cols-[88px_1fr] items-center gap-2 py-1"
    >
      <span className="text-xs text-muted truncate">{label}</span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

const inputBase =
  "w-full rounded-md bg-panel-2 border border-border px-2 py-1 text-sm text-text outline-none focus:border-accent transition-colors";

// ---------------------------------------------------------------------------
// NumberField
// ---------------------------------------------------------------------------

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string>(String(value));

  // Mantén el buffer en sync cuando cambia el valor externo.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (typeof min === "number") next = Math.max(min, next);
    if (typeof max === "number") next = Math.min(max, next);
    if (next !== value) onChange(next);
    setDraft(String(next));
  };

  return (
    <FieldRow label={label} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={inputBase}
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">
            {suffix}
          </span>
        )}
      </div>
    </FieldRow>
  );
}

// ---------------------------------------------------------------------------
// TextField
// ---------------------------------------------------------------------------

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: TextFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string>(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (raw: string) => {
    if (raw !== value) onChange(raw);
  };

  if (multiline) {
    return (
      <div className="py-1">
        <label htmlFor={id} className="mb-1 block text-xs text-muted">
          {label}
        </label>
        <textarea
          id={id}
          rows={3}
          className={`${inputBase} resize-y leading-snug`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
        />
      </div>
    );
  }

  return (
    <FieldRow label={label} htmlFor={id}>
      <input
        id={id}
        type="text"
        className={inputBase}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </FieldRow>
  );
}

// ---------------------------------------------------------------------------
// ColorField
// ---------------------------------------------------------------------------

interface ColorFieldProps {
  label: string;
  /** Puede ser undefined para colores opcionales. */
  value: string | undefined;
  onChange: (value: string) => void;
  /** Si se pasa, muestra un botón para limpiar el valor opcional. */
  onClear?: () => void;
  fallback?: string;
}

export function ColorField({
  label,
  value,
  onChange,
  onClear,
  fallback = "#000000",
}: ColorFieldProps) {
  const id = useId();
  const current = value ?? fallback;
  const isSet = typeof value === "string" && value.length > 0;

  return (
    <FieldRow label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-panel-2 p-0.5"
          value={current}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className={`${inputBase} font-mono text-xs ${isSet ? "" : "text-muted"}`}
          value={isSet ? value : ""}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value)}
        />
        {onClear && isSet && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded border border-border px-1.5 py-1 text-[10px] text-muted hover:text-text hover:border-accent"
            title="Quitar color"
          >
            ✕
          </button>
        )}
      </div>
    </FieldRow>
  );
}

// ---------------------------------------------------------------------------
// SelectField
// ---------------------------------------------------------------------------

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[] | readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId();
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );

  return (
    <FieldRow label={label} htmlFor={id}>
      <select
        id={id}
        className={`${inputBase} cursor-pointer`}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {normalized.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

// ---------------------------------------------------------------------------
// SliderField (slider + número compacto)
// ---------------------------------------------------------------------------

interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
}: SliderFieldProps) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          className="min-w-0 flex-1"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted">
          {Number.isInteger(step) ? value : value.toFixed(2)}
        </span>
      </div>
    </FieldRow>
  );
}

// ---------------------------------------------------------------------------
// RangeField (alias semántico para rangos numéricos genéricos)
// ---------------------------------------------------------------------------

export function RangeField(props: SliderFieldProps) {
  return <SliderField {...props} />;
}

// ---------------------------------------------------------------------------
// CheckboxField
// ---------------------------------------------------------------------------

interface CheckboxFieldProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function CheckboxField({ label, value, onChange }: CheckboxFieldProps) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </FieldRow>
  );
}
