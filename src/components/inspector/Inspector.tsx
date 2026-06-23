"use client";

import { useState } from "react";
import { Plus, Trash2, MousePointerClick } from "lucide-react";
import { useEditor } from "@/lib/store";
import { findClip } from "@/lib/commands";
import type {
  AnimatableProperty,
  Animation,
  AnimationPreset,
  AudioClip,
  BlendMode,
  Clip,
  Crop,
  Easing,
  Effect,
  EffectType,
  ImageClip,
  Mask,
  RgbTriad,
  ShapeClip,
  ShapeKind,
  SolidClip,
  TextClip,
  VideoClip,
} from "@/lib/schema";
import { Section } from "./Section";
import { KeyframeEditor } from "./KeyframeEditor";
import { ColorWheel } from "./ColorWheel";
import {
  CheckboxField,
  ColorField,
  NumberField,
  SelectField,
  SliderField,
  TextField,
} from "./Field";

// ---------------------------------------------------------------------------
// Constantes (presets disponibles del contrato)
// ---------------------------------------------------------------------------

const ANIMATION_PRESETS: AnimationPreset[] = [
  "none",
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-in",
  "zoom-out",
  "pop",
  "blur",
  "wipe-left",
  "wipe-right",
];

const EASINGS: Easing[] = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "spring",
];

const EFFECT_TYPES: EffectType[] = [
  "blur",
  "brightness",
  "contrast",
  "saturate",
  "grayscale",
  "sepia",
  "hue-rotate",
  "invert",
  "glow",
  "vignette",
  "rgb-split",
  "duotone",
];

/** Valor por defecto sensato al añadir un efecto. */
const defaultEffectValue = (type: EffectType): number => {
  switch (type) {
    case "blur":
      return 8; // px
    case "hue-rotate":
      return 90; // deg
    case "brightness":
    case "contrast":
    case "saturate":
      return 1.5; // multiplicador
    case "grayscale":
    case "sepia":
    case "invert":
      return 1; // 0..1
    case "glow":
      return 40; // 0..100 intensidad del bloom
    case "vignette":
      return 50; // 0..100 oscuridad
    case "rgb-split":
      return 5; // px de offset
    case "duotone":
      return 80; // 0..100 mezcla
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
};

const CLIP_TYPE_LABEL: Record<Clip["type"], string> = {
  video: "Video",
  image: "Imagen",
  audio: "Audio",
  text: "Texto",
  shape: "Forma",
  solid: "Fondo sólido",
};

// ---------------------------------------------------------------------------
// Compositing: opciones de blend mode y máscara
// ---------------------------------------------------------------------------

const BLEND_MODES: readonly { value: BlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiplicar" },
  { value: "screen", label: "Trama (screen)" },
  { value: "overlay", label: "Superposición" },
  { value: "darken", label: "Oscurecer" },
  { value: "lighten", label: "Aclarar" },
  { value: "color-dodge", label: "Sobreexponer color" },
  { value: "color-burn", label: "Subexponer color" },
  { value: "hard-light", label: "Luz fuerte" },
  { value: "soft-light", label: "Luz suave" },
  { value: "difference", label: "Diferencia" },
  { value: "exclusion", label: "Exclusión" },
  { value: "hue", label: "Tono" },
  { value: "saturation", label: "Saturación" },
  { value: "color", label: "Color" },
  { value: "luminosity", label: "Luminosidad" },
];

const MASKS: readonly { value: Mask; label: string }[] = [
  { value: "none", label: "Ninguna" },
  { value: "circle", label: "Círculo" },
  { value: "ellipse", label: "Elipse" },
  { value: "rounded", label: "Redondeada" },
];

// ---------------------------------------------------------------------------
// Color: efectos de filtro mapeados a sliders, con su valor neutro
// ---------------------------------------------------------------------------

/** Efectos de color editables como sliders, con rango y valor neutro. */
const COLOR_EFFECTS: readonly {
  type: Extract<
    EffectType,
    "brightness" | "contrast" | "saturate" | "grayscale" | "sepia" | "hue-rotate"
  >;
  label: string;
  min: number;
  max: number;
  step: number;
  neutral: number;
}[] = [
  { type: "brightness", label: "Brillo", min: 0, max: 2, step: 0.01, neutral: 1 },
  { type: "contrast", label: "Contraste", min: 0, max: 2, step: 0.01, neutral: 1 },
  { type: "saturate", label: "Saturación", min: 0, max: 2, step: 0.01, neutral: 1 },
  { type: "grayscale", label: "Grises", min: 0, max: 1, step: 0.01, neutral: 0 },
  { type: "sepia", label: "Sepia", min: 0, max: 1, step: 0.01, neutral: 0 },
  { type: "hue-rotate", label: "Tono", min: 0, max: 360, step: 1, neutral: 0 },
];

type ColorEffectType = (typeof COLOR_EFFECTS)[number]["type"];

/** Tipos visuales (todos excepto audio). */
type VisualClip = Exclude<Clip, AudioClip>;
const isVisual = (clip: Clip): clip is VisualClip => clip.type !== "audio";

// ---------------------------------------------------------------------------
// Inspector principal
// ---------------------------------------------------------------------------

export function Inspector() {
  const selectedClipId = useEditor((s) => s.selectedClipId);
  // Suscribirse al documento garantiza re-render cuando el clip cambia;
  // selectedClip() se resuelve a partir del documento ya suscrito.
  const document = useEditor((s) => s.document);
  const clip = selectedClipId ? findClip(document, selectedClipId)?.clip ?? null : null;
  const runCommand = useEditor((s) => s.runCommand);
  const currentFrame = useEditor((s) => s.currentFrame);

  if (!selectedClipId || !clip) {
    return (
      <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-panel">
        <Header title="Propiedades" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <MousePointerClick size={32} className="text-muted/60" />
          <p className="text-sm text-muted">
            Selecciona un clip para editar sus propiedades
          </p>
        </div>
      </aside>
    );
  }

  const clipId = clip.id;
  const patch = (p: Record<string, unknown>) =>
    runCommand({ type: "update_clip", clipId, patch: p });

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-panel">
      <Header title="Propiedades" subtitle={CLIP_TYPE_LABEL[clip.type]} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <GeneralSection clip={clip} patch={patch} />
        <TransformSection clip={clip} patch={patch} />
        <TypeSpecificSection clip={clip} patch={patch} />
        {isVisual(clip) && <ColorSection clip={clip} patch={patch} />}
        {isVisual(clip) && <ColorGradeSection clip={clip} patch={patch} />}
        {(clip.type === "video" || clip.type === "audio") && (
          <SpeedSection clip={clip} patch={patch} />
        )}
        {(clip.type === "image" ||
          clip.type === "video" ||
          clip.type === "text" ||
          clip.type === "shape") && <CompositingSection clip={clip} patch={patch} />}
        <AnimationSection clip={clip} clipId={clipId} />
        <KeyframesSection clip={clip} clipId={clipId} currentFrame={currentFrame} />
        <EffectsSection clip={clip} clipId={clipId} />
        <QuickTransitionSection clipId={clipId} />
      </div>
    </aside>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-3">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      {subtitle && (
        <span className="rounded bg-panel-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
          {subtitle}
        </span>
      )}
    </div>
  );
}

type PatchFn = (p: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// 1) General
// ---------------------------------------------------------------------------

function GeneralSection({ clip, patch }: { clip: Clip; patch: PatchFn }) {
  return (
    <Section title="General">
      <TextField
        label="Nombre"
        value={clip.name}
        onChange={(v) => patch({ name: v })}
      />
      <NumberField
        label="Inicio"
        value={clip.start}
        min={0}
        suffix="f"
        onChange={(v) => patch({ start: v })}
      />
      <NumberField
        label="Duración"
        value={clip.duration}
        min={1}
        suffix="f"
        onChange={(v) => patch({ duration: v })}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 2) Transform
// ---------------------------------------------------------------------------

function TransformSection({ clip, patch }: { clip: Clip; patch: PatchFn }) {
  return (
    <Section title="Transformación">
      <NumberField label="X" value={clip.x} suffix="px" onChange={(v) => patch({ x: v })} />
      <NumberField label="Y" value={clip.y} suffix="px" onChange={(v) => patch({ y: v })} />
      <SliderField
        label="Escala"
        value={clip.scale}
        min={0.1}
        max={4}
        step={0.01}
        onChange={(v) => patch({ scale: v })}
      />
      <SliderField
        label="Rotación"
        value={clip.rotation}
        min={-180}
        max={180}
        step={1}
        onChange={(v) => patch({ rotation: v })}
      />
      <SliderField
        label="Opacidad"
        value={clip.opacity}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => patch({ opacity: v })}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 3) Específico por tipo (narrowing por clip.type)
// ---------------------------------------------------------------------------

function TypeSpecificSection({ clip, patch }: { clip: Clip; patch: PatchFn }) {
  switch (clip.type) {
    case "text":
      return <TextProps clip={clip} patch={patch} />;
    case "image":
      return <ImageProps clip={clip} patch={patch} />;
    case "video":
      return <VideoProps clip={clip} patch={patch} />;
    case "audio":
      return <AudioProps clip={clip} patch={patch} />;
    case "shape":
      return <ShapeProps clip={clip} patch={patch} />;
    case "solid":
      return <SolidProps clip={clip} patch={patch} />;
    default: {
      const _exhaustive: never = clip;
      return _exhaustive;
    }
  }
}

function TextProps({ clip, patch }: { clip: TextClip; patch: PatchFn }) {
  return (
    <Section title="Texto">
      <TextField
        label="Texto"
        multiline
        value={clip.text}
        onChange={(v) => patch({ text: v })}
      />
      <NumberField
        label="Tamaño"
        value={clip.fontSize}
        min={1}
        suffix="px"
        onChange={(v) => patch({ fontSize: v })}
      />
      <NumberField
        label="Grosor"
        value={clip.fontWeight}
        min={100}
        max={900}
        step={100}
        onChange={(v) => patch({ fontWeight: v })}
      />
      <ColorField label="Color" value={clip.color} onChange={(v) => patch({ color: v })} />
      <ColorField
        label="Fondo"
        value={clip.backgroundColor}
        onChange={(v) => patch({ backgroundColor: v })}
        onClear={() => patch({ backgroundColor: undefined })}
        fallback="#000000"
      />
      <SelectField<TextClip["textAlign"]>
        label="Alineación"
        value={clip.textAlign}
        options={[
          { value: "left", label: "Izquierda" },
          { value: "center", label: "Centro" },
          { value: "right", label: "Derecha" },
        ]}
        onChange={(v) => patch({ textAlign: v })}
      />
      <NumberField
        label="Interlineado"
        value={clip.lineHeight}
        min={0.5}
        step={0.1}
        onChange={(v) => patch({ lineHeight: v })}
      />
      <NumberField
        label="Espaciado"
        value={clip.letterSpacing}
        suffix="px"
        onChange={(v) => patch({ letterSpacing: v })}
      />
      <CheckboxField
        label="Cursiva"
        value={clip.italic}
        onChange={(v) => patch({ italic: v })}
      />
      <div className="mt-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
        Contorno
      </div>
      <ColorField
        label="Color trazo"
        value={clip.strokeColor}
        onChange={(v) => patch({ strokeColor: v })}
        onClear={() => patch({ strokeColor: undefined })}
        fallback="#000000"
      />
      <NumberField
        label="Grosor trazo"
        value={clip.strokeWidth}
        min={0}
        suffix="px"
        onChange={(v) => patch({ strokeWidth: v })}
      />
      <div className="mt-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
        Sombra
      </div>
      <ColorField
        label="Color sombra"
        value={clip.shadowColor}
        onChange={(v) => patch({ shadowColor: v })}
        onClear={() => patch({ shadowColor: undefined })}
        fallback="#000000"
      />
      <NumberField
        label="Desenfoque"
        value={clip.shadowBlur}
        min={0}
        suffix="px"
        onChange={(v) => patch({ shadowBlur: v })}
      />
      <NumberField
        label="Offset X"
        value={clip.shadowOffsetX}
        suffix="px"
        onChange={(v) => patch({ shadowOffsetX: v })}
      />
      <NumberField
        label="Offset Y"
        value={clip.shadowOffsetY}
        suffix="px"
        onChange={(v) => patch({ shadowOffsetY: v })}
      />
    </Section>
  );
}

function FitField({
  value,
  onChange,
}: {
  value: "cover" | "contain" | "fill";
  onChange: (v: "cover" | "contain" | "fill") => void;
}) {
  return (
    <SelectField<"cover" | "contain" | "fill">
      label="Ajuste"
      value={value}
      options={[
        { value: "cover", label: "Cubrir (cover)" },
        { value: "contain", label: "Contener (contain)" },
        { value: "fill", label: "Rellenar (fill)" },
      ]}
      onChange={onChange}
    />
  );
}

function ImageProps({ clip, patch }: { clip: ImageClip; patch: PatchFn }) {
  return (
    <Section title="Imagen">
      <TextField label="Origen" value={clip.src} onChange={(v) => patch({ src: v })} />
      <FitField value={clip.fit} onChange={(v) => patch({ fit: v })} />
    </Section>
  );
}

function VideoProps({ clip, patch }: { clip: VideoClip; patch: PatchFn }) {
  return (
    <Section title="Video">
      <TextField label="Origen" value={clip.src} onChange={(v) => patch({ src: v })} />
      <FitField value={clip.fit} onChange={(v) => patch({ fit: v })} />
      <SliderField
        label="Volumen"
        value={clip.volume}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => patch({ volume: v })}
      />
      <CheckboxField
        label="Silenciar"
        value={clip.muted}
        onChange={(v) => patch({ muted: v })}
      />
      <NumberField
        label="Recorte ini."
        value={clip.trimStart}
        min={0}
        suffix="f"
        onChange={(v) => patch({ trimStart: v })}
      />
    </Section>
  );
}

function AudioProps({ clip, patch }: { clip: AudioClip; patch: PatchFn }) {
  return (
    <Section title="Audio">
      <TextField label="Origen" value={clip.src} onChange={(v) => patch({ src: v })} />
      <SliderField
        label="Volumen"
        value={clip.volume}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => patch({ volume: v })}
      />
      <NumberField
        label="Recorte ini."
        value={clip.trimStart}
        min={0}
        suffix="f"
        onChange={(v) => patch({ trimStart: v })}
      />
      <NumberField
        label="Fade in"
        value={clip.fadeInFrames}
        min={0}
        suffix="f"
        onChange={(v) => patch({ fadeInFrames: v })}
      />
      <NumberField
        label="Fade out"
        value={clip.fadeOutFrames}
        min={0}
        suffix="f"
        onChange={(v) => patch({ fadeOutFrames: v })}
      />
    </Section>
  );
}

function ShapeProps({ clip, patch }: { clip: ShapeClip; patch: PatchFn }) {
  return (
    <Section title="Forma">
      <SelectField<ShapeKind>
        label="Tipo"
        value={clip.shape}
        options={[
          { value: "rect", label: "Rectángulo" },
          { value: "circle", label: "Círculo" },
          { value: "ellipse", label: "Elipse" },
          { value: "triangle", label: "Triángulo" },
          { value: "star", label: "Estrella" },
        ]}
        onChange={(v) => patch({ shape: v })}
      />
      <ColorField label="Relleno" value={clip.fill} onChange={(v) => patch({ fill: v })} />
      <ColorField
        label="Color trazo"
        value={clip.strokeColor}
        onChange={(v) => patch({ strokeColor: v })}
        onClear={() => patch({ strokeColor: undefined })}
        fallback="#000000"
      />
      <NumberField
        label="Grosor trazo"
        value={clip.strokeWidth}
        min={0}
        suffix="px"
        onChange={(v) => patch({ strokeWidth: v })}
      />
      <NumberField
        label="Radio esq."
        value={clip.cornerRadius}
        min={0}
        suffix="px"
        onChange={(v) => patch({ cornerRadius: v })}
      />
      <NumberField
        label="Ancho"
        value={clip.width ?? 0}
        min={0}
        suffix="px"
        onChange={(v) => patch({ width: v })}
      />
      <NumberField
        label="Alto"
        value={clip.height ?? 0}
        min={0}
        suffix="px"
        onChange={(v) => patch({ height: v })}
      />
    </Section>
  );
}

function SolidProps({ clip, patch }: { clip: SolidClip; patch: PatchFn }) {
  return (
    <Section title="Fondo sólido">
      <ColorField label="Color" value={clip.color} onChange={(v) => patch({ color: v })} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 3b) Color (sliders → array de effects)
// ---------------------------------------------------------------------------

/** Lee el valor actual de un efecto de color desde clip.effects (o el neutro). */
function readColorValue(clip: Clip, type: ColorEffectType, neutral: number): number {
  const found = clip.effects.find((e) => e.type === type);
  return found ? found.value : neutral;
}

function ColorSection({ clip, patch }: { clip: VisualClip; patch: PatchFn }) {
  // Reemplaza (o elimina si es neutro) un efecto de color manteniendo el resto.
  const setColorEffect = (type: ColorEffectType, value: number, neutral: number) => {
    const rest = clip.effects.filter((e) => e.type !== type);
    const next: Effect[] =
      value === neutral ? rest : [...rest, { type, value }];
    patch({ effects: next });
  };

  return (
    <Section title="Color" defaultOpen={false}>
      {COLOR_EFFECTS.map((ce) => (
        <SliderField
          key={ce.type}
          label={ce.label}
          value={readColorValue(clip, ce.type, ce.neutral)}
          min={ce.min}
          max={ce.max}
          step={ce.step}
          onChange={(v) => setColorEffect(ce.type, v, ce.neutral)}
        />
      ))}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 3b-bis) Color profesional (lift/gamma/gain + temp/tint/exp/contraste/sat)
// ---------------------------------------------------------------------------

const NEUTRAL_GRADE = {
  temperature: 0, tint: 0, exposure: 0, contrast: 0, saturation: 0, lift: 0, gamma: 0, gain: 0,
};
type ScalarGradeKey = keyof typeof NEUTRAL_GRADE;
const GLOBAL_GRADE_FIELDS: { key: ScalarGradeKey; label: string }[] = [
  { key: "temperature", label: "Temperatura" },
  { key: "tint", label: "Tinte" },
  { key: "exposure", label: "Exposición" },
  { key: "contrast", label: "Contraste" },
  { key: "saturation", label: "Saturación" },
];
// Cada rueda (balance per-canal) va emparejada con su master de luminancia.
const WHEELS: { wheel: "liftRGB" | "gammaRGB" | "gainRGB"; master: ScalarGradeKey; label: string }[] = [
  { wheel: "liftRGB", master: "lift", label: "Sombras" },
  { wheel: "gammaRGB", master: "gamma", label: "Medios" },
  { wheel: "gainRGB", master: "gain", label: "Altas" },
];

function ColorGradeSection({ clip, patch }: { clip: VisualClip; patch: PatchFn }) {
  const cg = { ...NEUTRAL_GRADE, ...(clip.colorGrade ?? {}) };
  const setScalar = (key: ScalarGradeKey, v: number) => patch({ colorGrade: { ...cg, [key]: v } });
  const setWheel = (key: "liftRGB" | "gammaRGB" | "gainRGB", v: RgbTriad) =>
    patch({ colorGrade: { ...cg, [key]: v } });

  return (
    <Section title="Color (pro)" defaultOpen={false}>
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          onClick={() => patch({ colorGrade: { ...NEUTRAL_GRADE } })}
          className="text-[11px] text-muted hover:text-text"
        >
          Reset
        </button>
      </div>

      {GLOBAL_GRADE_FIELDS.map((f) => (
        <SliderField
          key={f.key}
          label={f.label}
          value={cg[f.key]}
          min={-100}
          max={100}
          step={1}
          onChange={(v) => setScalar(f.key, v)}
        />
      ))}

      {/* Ruedas de color (lift/gamma/gain) con su master de luminancia */}
      <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
        Ruedas de color
      </div>
      <div className="grid grid-cols-3 gap-2">
        {WHEELS.map((w) => (
          <ColorWheel
            key={w.wheel}
            label={w.label}
            value={clip.colorGrade?.[w.wheel]}
            onChange={(v) => setWheel(w.wheel, v)}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {WHEELS.map((w) => (
          <SliderField
            key={w.master}
            label={w.label}
            value={cg[w.master]}
            min={-100}
            max={100}
            step={1}
            onChange={(v) => setScalar(w.master, v)}
          />
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 3c) Velocidad (video / audio)
// ---------------------------------------------------------------------------

function SpeedSection({
  clip,
  patch,
}: {
  clip: VideoClip | AudioClip;
  patch: PatchFn;
}) {
  // Ajusta la duración en timeline para reflejar la nueva velocidad sin acumular
  // error: nueva = duración * (velocidadActual / velocidadNueva).
  const setRate = (r: number) => {
    if (r <= 0) return;
    patch({
      playbackRate: r,
      duration: Math.max(1, Math.round(clip.duration * (clip.playbackRate / r))),
    });
  };

  return (
    <Section title="Velocidad" defaultOpen={false}>
      <SliderField
        label="Velocidad"
        value={clip.playbackRate}
        min={0.25}
        max={4}
        step={0.05}
        onChange={setRate}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 3d) Compositing (blend mode, máscara, recorte)
// ---------------------------------------------------------------------------

function CompositingSection({ clip, patch }: { clip: VisualClip; patch: PatchFn }) {
  const crop: Crop = clip.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const setCrop = (side: keyof Crop, value: number) =>
    patch({ crop: { ...crop, [side]: value } });

  return (
    <Section title="Compositing" defaultOpen={false}>
      <SelectField<BlendMode>
        label="Mezcla"
        value={clip.blendMode}
        options={BLEND_MODES}
        onChange={(v) => patch({ blendMode: v })}
      />
      <SelectField<Mask>
        label="Máscara"
        value={clip.mask}
        options={MASKS}
        onChange={(v) => patch({ mask: v })}
      />
      <div className="mt-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
        Recorte (%)
      </div>
      <SliderField
        label="Arriba"
        value={crop.top}
        min={0}
        max={100}
        step={1}
        onChange={(v) => setCrop("top", v)}
      />
      <SliderField
        label="Derecha"
        value={crop.right}
        min={0}
        max={100}
        step={1}
        onChange={(v) => setCrop("right", v)}
      />
      <SliderField
        label="Abajo"
        value={crop.bottom}
        min={0}
        max={100}
        step={1}
        onChange={(v) => setCrop("bottom", v)}
      />
      <SliderField
        label="Izquierda"
        value={crop.left}
        min={0}
        max={100}
        step={1}
        onChange={(v) => setCrop("left", v)}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 4) Animaciones (entrada / salida)
// ---------------------------------------------------------------------------

function AnimationSection({ clip, clipId }: { clip: Clip; clipId: string }) {
  const runCommand = useEditor((s) => s.runCommand);

  const setIn = (next: Animation) => runCommand({ type: "set_animation", clipId, in: next });
  const setOut = (next: Animation) => runCommand({ type: "set_animation", clipId, out: next });

  return (
    <Section title="Animaciones">
      <AnimationEditor title="Entrada" anim={clip.animationIn} onChange={setIn} />
      <div className="my-2 border-t border-border/60" />
      <AnimationEditor title="Salida" anim={clip.animationOut} onChange={setOut} />
    </Section>
  );
}

function AnimationEditor({
  title,
  anim,
  onChange,
}: {
  title: string;
  anim: Animation;
  onChange: (next: Animation) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-text">{title}</div>
      <SelectField<AnimationPreset>
        label="Preset"
        value={anim.preset}
        options={ANIMATION_PRESETS}
        onChange={(preset) => onChange({ ...anim, preset })}
      />
      <NumberField
        label="Duración"
        value={anim.durationInFrames}
        min={0}
        suffix="f"
        onChange={(durationInFrames) => onChange({ ...anim, durationInFrames })}
      />
      <SelectField<Easing>
        label="Easing"
        value={anim.easing}
        options={EASINGS}
        onChange={(easing) => onChange({ ...anim, easing })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5) Keyframes (editor visual de curvas + lista textual)
// ---------------------------------------------------------------------------

/** Propiedades animables disponibles según el tipo de clip (volume solo a/v). */
function availableKfProps(clip: Clip): AnimatableProperty[] {
  const base: AnimatableProperty[] = ["x", "y", "scale", "rotation", "opacity"];
  if (clip.type === "audio") return [...base, "volume"];
  // Clips visuales: maskRadius (anima la máscara). Solo video además lleva volumen.
  const visual: AnimatableProperty[] = [...base, "maskRadius"];
  return clip.type === "video" ? [...visual, "volume"] : visual;
}

const KF_PROP_LABEL: Record<AnimatableProperty, string> = {
  x: "X",
  y: "Y",
  scale: "Escala",
  rotation: "Rotación",
  opacity: "Opacidad",
  volume: "Volumen",
  maskRadius: "Máscara %",
};

/** Lee el valor base (sin animar) de una propiedad del clip. */
function readKfBaseValue(clip: Clip, property: AnimatableProperty): number {
  switch (property) {
    case "x":
      return clip.x;
    case "y":
      return clip.y;
    case "scale":
      return clip.scale;
    case "rotation":
      return clip.rotation;
    case "opacity":
      return clip.opacity;
    case "maskRadius":
      return (clip as { maskRadius?: number }).maskRadius ?? 100;
    case "volume":
      return clip.type === "video" || clip.type === "audio" ? clip.volume : 1;
    default: {
      const _exhaustive: never = property;
      return _exhaustive;
    }
  }
}

function KeyframesSection({
  clip,
  clipId,
  currentFrame,
}: {
  clip: Clip;
  clipId: string;
  currentFrame: number;
}) {
  const runCommand = useEditor((s) => s.runCommand);

  // El editor visual de curvas usa currentFrame internamente vía el store;
  // este derivado mantiene el atajo "Añadir en frame actual" coherente con el
  // contrato (frame relativo al inicio del clip).
  const relativeFrame = Math.max(0, currentFrame - clip.start);

  // Propiedad para el atajo "Keyframe aquí"; se corrige si deja de existir.
  const kfProps = availableKfProps(clip);
  const [kfProp, setKfProp] = useState<AnimatableProperty>("opacity");
  const activeKfProp = kfProps.includes(kfProp) ? kfProp : kfProps[0];
  const playheadInsideClip = relativeFrame <= Math.max(0, clip.duration - 1);

  const removeKeyframe = (prop: AnimatableProperty, frame: number) => {
    runCommand({ type: "remove_keyframe", clipId, property: prop, frame });
  };

  // Añade un keyframe en el playhead (frame relativo) usando el valor base
  // actual de la propiedad seleccionada.
  const addKeyframeHere = () => {
    runCommand({
      type: "add_keyframe",
      clipId,
      property: activeKfProp,
      keyframe: {
        frame: relativeFrame,
        value: readKfBaseValue(clip, activeKfProp),
        easing: "ease-in-out",
      },
    });
  };

  return (
    <Section title="Keyframes" defaultOpen={false}>
      {/* Atajo: añadir keyframe en el frame actual (playhead) */}
      <div className="mb-2 flex items-end gap-2">
        <div className="flex-1">
          <SelectField<AnimatableProperty>
            label="Propiedad"
            value={activeKfProp}
            options={kfProps.map((p) => ({ value: p, label: KF_PROP_LABEL[p] }))}
            onChange={setKfProp}
          />
        </div>
        <button
          type="button"
          onClick={addKeyframeHere}
          disabled={!playheadInsideClip}
          title={
            playheadInsideClip
              ? `Añadir keyframe en f${relativeFrame}`
              : "Mueve el playhead dentro del clip"
          }
          className="mb-1 flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={13} /> Keyframe aquí
        </button>
      </div>

      {/* Editor visual de curvas (principal) */}
      <KeyframeEditor clip={clip} clipId={clipId} />

      {/* Lista textual de todos los tracks (resumen, debajo del gráfico) */}
      {clip.keyframeTracks.some((kt) => kt.keyframes.length > 0) && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">
            Todos los keyframes
          </div>
          {clip.keyframeTracks
            .filter((kt) => kt.keyframes.length > 0)
            .map((kt) => (
              <div key={kt.property} className="rounded-md border border-border bg-panel-2 p-2">
                <div className="mb-1 text-[11px] font-semibold text-text">{kt.property}</div>
                <ul className="space-y-1">
                  {[...kt.keyframes]
                    .sort((a, b) => a.frame - b.frame)
                    .map((kf) => (
                      <li
                        key={kf.frame}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="font-mono text-muted">
                          f{kf.frame} · {kf.value.toFixed(2)} · {kf.easing}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeKeyframe(kt.property, kf.frame)}
                          className="text-muted hover:text-[var(--danger)]"
                          title="Eliminar keyframe"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 6) Efectos
// ---------------------------------------------------------------------------

const EFFECT_LABEL: Record<EffectType, string> = {
  blur: "Desenfoque",
  brightness: "Brillo",
  contrast: "Contraste",
  saturate: "Saturación",
  grayscale: "Escala de grises",
  sepia: "Sepia",
  "hue-rotate": "Rotar matiz",
  invert: "Invertir",
  glow: "Glow",
  vignette: "Viñeta",
  "rgb-split": "Aberración RGB",
  duotone: "Duotono",
};

function EffectsSection({ clip, clipId }: { clip: Clip; clipId: string }) {
  const runCommand = useEditor((s) => s.runCommand);
  const [type, setType] = useState<EffectType>("blur");

  const addEffect = () => {
    const effect: Effect = { type, value: defaultEffectValue(type) };
    runCommand({ type: "add_effect", clipId, effect });
  };

  const removeEffect = (index: number) => {
    runCommand({ type: "remove_effect", clipId, index });
  };

  return (
    <Section title="Efectos" defaultOpen={false}>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <SelectField<EffectType>
            label="Tipo"
            value={type}
            options={EFFECT_TYPES.map((t) => ({ value: t, label: EFFECT_LABEL[t] }))}
            onChange={setType}
          />
        </div>
        <button
          type="button"
          onClick={addEffect}
          className="mb-1 flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-white hover:bg-accent-2"
        >
          <Plus size={13} /> Añadir
        </button>
      </div>

      {clip.effects.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Sin efectos.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {clip.effects.map((effect, index) => (
            <li
              key={`${effect.type}-${index}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs"
            >
              <span className="text-text">{EFFECT_LABEL[effect.type]}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-muted">{effect.value}</span>
                <button
                  type="button"
                  onClick={() => removeEffect(index)}
                  className="text-muted hover:text-[var(--danger)]"
                  title="Eliminar efecto"
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 7) Transición rápida (atajos a set_animation de entrada)
// ---------------------------------------------------------------------------

const QUICK_TRANSITIONS: readonly {
  key: "crossfade" | "slide" | "zoom";
  label: string;
  preset: AnimationPreset;
}[] = [
  { key: "crossfade", label: "Crossfade", preset: "fade" },
  { key: "slide", label: "Slide", preset: "slide-left" },
  { key: "zoom", label: "Zoom", preset: "zoom-in" },
];

function QuickTransitionSection({ clipId }: { clipId: string }) {
  const runCommand = useEditor((s) => s.runCommand);
  const [duration, setDuration] = useState<number>(15);

  const applyTransition = (preset: AnimationPreset) => {
    runCommand({
      type: "set_animation",
      clipId,
      in: { preset, durationInFrames: Math.max(0, duration), easing: "ease-in-out" },
    });
  };

  return (
    <Section title="Transición rápida" defaultOpen={false}>
      <div className="flex flex-wrap gap-2">
        {QUICK_TRANSITIONS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => applyTransition(t.preset)}
            className="flex-1 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs font-medium text-text hover:border-accent hover:text-accent"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-2">
        <NumberField
          label="Duración"
          value={duration}
          min={0}
          suffix="f"
          onChange={setDuration}
        />
      </div>
    </Section>
  );
}
