import { z } from "zod";

/**
 * THE CONTRACT.
 *
 * A video project is a single JSON document. Every part of the system
 * (the editor UI, the Next.js API, the Remotion renderer, and the MCP server)
 * reads and writes this exact shape. Nothing else is the source of truth.
 *
 * Coordinates: x/y are pixel offsets from the CENTER of the canvas
 * (0,0 = centered). Times are measured in FRAMES (use project.fps to convert
 * to seconds). `start` is the clip's position on the timeline; `trimStart` is
 * how many frames into the source media the clip begins.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const EasingSchema = z.enum([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "spring",
]);
export type Easing = z.infer<typeof EasingSchema>;

/** Properties that can be keyframed or animated. */
export const AnimatablePropertySchema = z.enum([
  "x",
  "y",
  "scale",
  "rotation",
  "opacity",
  "volume",
]);
export type AnimatableProperty = z.infer<typeof AnimatablePropertySchema>;

export const KeyframeSchema = z.object({
  /** Frame relative to the clip's start (0 = first frame of the clip). */
  frame: z.number().min(0),
  value: z.number(),
  easing: EasingSchema.default("ease-in-out"),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const KeyframeTrackSchema = z.object({
  property: AnimatablePropertySchema,
  keyframes: z.array(KeyframeSchema),
});
export type KeyframeTrack = z.infer<typeof KeyframeTrackSchema>;

// ---------------------------------------------------------------------------
// Enter / exit animation presets
// ---------------------------------------------------------------------------

export const AnimationPresetSchema = z.enum([
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
]);
export type AnimationPreset = z.infer<typeof AnimationPresetSchema>;

export const AnimationSchema = z.object({
  preset: AnimationPresetSchema.default("none"),
  durationInFrames: z.number().min(0).default(15),
  easing: EasingSchema.default("ease-in-out"),
});
export type Animation = z.infer<typeof AnimationSchema>;

const defaultAnimation = (): Animation => ({
  preset: "none",
  durationInFrames: 15,
  easing: "ease-in-out",
});

// ---------------------------------------------------------------------------
// Effects / filters (map to CSS filter on the rendered element)
// ---------------------------------------------------------------------------

export const EffectTypeSchema = z.enum([
  "blur",
  "brightness",
  "contrast",
  "saturate",
  "grayscale",
  "sepia",
  "hue-rotate",
  "invert",
]);
export type EffectType = z.infer<typeof EffectTypeSchema>;

export const EffectSchema = z.object({
  type: EffectTypeSchema,
  /** Meaning depends on type: px for blur, deg for hue-rotate, 0..n multiplier
   *  for brightness/contrast/saturate, 0..1 for grayscale/sepia/invert. */
  value: z.number(),
});
export type Effect = z.infer<typeof EffectSchema>;

// ---------------------------------------------------------------------------
// Compositing (blend mode, crop, mask)
// ---------------------------------------------------------------------------

export const BlendModeSchema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);
export type BlendMode = z.infer<typeof BlendModeSchema>;

/** Recorte por lados, en porcentaje (0..100) del propio clip. */
export const CropSchema = z.object({
  top: z.number().min(0).max(100).default(0),
  right: z.number().min(0).max(100).default(0),
  bottom: z.number().min(0).max(100).default(0),
  left: z.number().min(0).max(100).default(0),
});
export type Crop = z.infer<typeof CropSchema>;

export const MaskSchema = z.enum(["none", "circle", "ellipse", "rounded"]);
export type Mask = z.infer<typeof MaskSchema>;

/** Balance de color per-canal de una rueda (lift/gamma/gain). −100..100, 0 neutro. */
export const RgbTriadSchema = z.object({
  r: z.number().default(0),
  g: z.number().default(0),
  b: z.number().default(0),
});
export type RgbTriad = z.infer<typeof RgbTriadSchema>;

/**
 * Corrección de color profesional (estilo DaVinci). Todos los valores en
 * −100..100, 0 = neutro. Se renderiza con filtros SVG (feColorMatrix +
 * feComponentTransfer) tanto en el preview como en el render.
 *
 * `lift/gamma/gain` son la luminancia (sombras/medios/altas). Las ruedas
 * `liftRGB/gammaRGB/gainRGB` añaden balance de COLOR per-canal sobre esas
 * mismas zonas (opcionales → retro-compatible).
 */
export const ColorGradeSchema = z.object({
  temperature: z.number().default(0), // cálido (+) / frío (−)
  tint: z.number().default(0), // magenta (+) / verde (−)
  exposure: z.number().default(0),
  contrast: z.number().default(0),
  saturation: z.number().default(0),
  lift: z.number().default(0), // sombras (luminancia)
  gamma: z.number().default(0), // medios (luminancia)
  gain: z.number().default(0), // altas luces (luminancia)
  /** Ruedas de color (balance per-canal por zona). */
  liftRGB: RgbTriadSchema.optional(),
  gammaRGB: RgbTriadSchema.optional(),
  gainRGB: RgbTriadSchema.optional(),
});
export type ColorGrade = z.infer<typeof ColorGradeSchema>;

// ---------------------------------------------------------------------------
// Shared transform shared by every clip
// ---------------------------------------------------------------------------

const transformFields = {
  /** px offset from canvas center. */
  x: z.number().default(0),
  y: z.number().default(0),
  /** Uniform scale multiplier (1 = native size). */
  scale: z.number().default(1),
  rotation: z.number().default(0), // degrees
  opacity: z.number().min(0).max(1).default(1),
  /** Explicit box size in px. If omitted the clip uses its natural size. */
  width: z.number().optional(),
  height: z.number().optional(),
  animationIn: AnimationSchema.default(defaultAnimation),
  animationOut: AnimationSchema.default(defaultAnimation),
  keyframeTracks: z.array(KeyframeTrackSchema).default([]),
  effects: z.array(EffectSchema).default([]),
  /** Compositing */
  blendMode: BlendModeSchema.default("normal"),
  crop: CropSchema.optional(),
  mask: MaskSchema.default("none"),
  /** Corrección de color pro (opcional; undefined = sin grade) */
  colorGrade: ColorGradeSchema.optional(),
};

const baseClipFields = {
  id: z.string(),
  name: z.string().default("Clip"),
  /** Position on the timeline, in frames. */
  start: z.number().min(0).default(0),
  /** Length on the timeline, in frames. */
  duration: z.number().min(1).default(90),
  ...transformFields,
};

// ---------------------------------------------------------------------------
// Clip variants
// ---------------------------------------------------------------------------

export const VideoClipSchema = z.object({
  type: z.literal("video"),
  ...baseClipFields,
  src: z.string(),
  /** Frames into the source media where playback begins. */
  trimStart: z.number().min(0).default(0),
  volume: z.number().min(0).max(1).default(1),
  muted: z.boolean().default(false),
  playbackRate: z.number().positive().default(1),
  /** Fades de audio del propio video (frames), como en los clips de audio. */
  fadeInFrames: z.number().min(0).default(0),
  fadeOutFrames: z.number().min(0).default(0),
  fit: z.enum(["cover", "contain", "fill"]).default("cover"),
});
export type VideoClip = z.infer<typeof VideoClipSchema>;

export const ImageClipSchema = z.object({
  type: z.literal("image"),
  ...baseClipFields,
  src: z.string(),
  fit: z.enum(["cover", "contain", "fill"]).default("cover"),
});
export type ImageClip = z.infer<typeof ImageClipSchema>;

export const AudioClipSchema = z.object({
  type: z.literal("audio"),
  ...baseClipFields,
  src: z.string(),
  trimStart: z.number().min(0).default(0),
  volume: z.number().min(0).max(1).default(1),
  playbackRate: z.number().positive().default(1),
  fadeInFrames: z.number().min(0).default(0),
  fadeOutFrames: z.number().min(0).default(0),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;

export const TextClipSchema = z.object({
  type: z.literal("text"),
  ...baseClipFields,
  text: z.string().default("Texto"),
  fontFamily: z.string().default("Inter"),
  fontSize: z.number().default(80),
  fontWeight: z.number().default(700),
  color: z.string().default("#ffffff"),
  backgroundColor: z.string().optional(),
  textAlign: z.enum(["left", "center", "right"]).default("center"),
  lineHeight: z.number().default(1.2),
  letterSpacing: z.number().default(0),
  italic: z.boolean().default(false),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().default(0),
  shadowColor: z.string().optional(),
  shadowBlur: z.number().default(0),
  shadowOffsetX: z.number().default(0),
  shadowOffsetY: z.number().default(0),
  // Captions animados (karaoke): palabras con timing en FRAMES relativos al INICIO
  // del clip. Si `words` está presente, el render resalta la palabra activa según
  // el frame actual (color `activeColor` + escala `activeScale`).
  words: z
    .array(z.object({ text: z.string(), start: z.number(), end: z.number() }))
    .optional(),
  activeColor: z.string().optional(),
  activeScale: z.number().optional(),
});
export type TextClip = z.infer<typeof TextClipSchema>;

export const ShapeKindSchema = z.enum([
  "rect",
  "circle",
  "ellipse",
  "triangle",
  "star",
]);
export type ShapeKind = z.infer<typeof ShapeKindSchema>;

export const ShapeClipSchema = z.object({
  type: z.literal("shape"),
  ...baseClipFields,
  shape: ShapeKindSchema.default("rect"),
  fill: z.string().default("#6366f1"),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().default(0),
  cornerRadius: z.number().default(0),
});
export type ShapeClip = z.infer<typeof ShapeClipSchema>;

export const SolidClipSchema = z.object({
  type: z.literal("solid"),
  ...baseClipFields,
  color: z.string().default("#000000"),
});
export type SolidClip = z.infer<typeof SolidClipSchema>;

export const ClipSchema = z.discriminatedUnion("type", [
  VideoClipSchema,
  ImageClipSchema,
  AudioClipSchema,
  TextClipSchema,
  ShapeClipSchema,
  SolidClipSchema,
]);
export type Clip = z.infer<typeof ClipSchema>;
export type ClipType = Clip["type"];

// ---------------------------------------------------------------------------
// Tracks & project
// ---------------------------------------------------------------------------

export const TrackSchema = z.object({
  id: z.string(),
  name: z.string().default("Pista"),
  /** "media" = visual layers (video/image/text/shape/solid); "audio" = sound. */
  kind: z.enum(["media", "audio"]).default("media"),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  volume: z.number().min(0).max(1).default(1),
  clips: z.array(ClipSchema).default([]),
});
export type Track = z.infer<typeof TrackSchema>;

/** Motion blur de cámara (sub-muestreo). undefined = desactivado. */
export const MotionBlurSchema = z.object({
  samples: z.number().min(1).max(30).default(10),
  shutterAngle: z.number().min(0).max(720).default(180),
});
export type MotionBlur = z.infer<typeof MotionBlurSchema>;

/** Marcador / capítulo en la línea de tiempo (frame absoluto). */
export const MarkerSchema = z.object({
  id: z.string(),
  frame: z.number().min(0),
  label: z.string().default(""),
  color: z.string().default("#f59e0b"),
  /**
   * `chapter` = marcador clásico (permanente). `note` = nota de edición anclada
   * a un timestamp que el asistente (vía MCP) lee y ejecuta en lote. Default
   * `chapter` para que los proyectos antiguos sigan siendo válidos.
   */
  kind: z.enum(["chapter", "note"]).default("chapter"),
  /** Texto de la nota / instrucción de edición ("aquí baja la música"). */
  note: z.string().optional(),
  /** Estado de la nota en el flujo anotar → revisar → aplicar. */
  status: z.enum(["pending", "applied", "dismissed"]).default("pending"),
  /** Cómo se capturó la nota. */
  source: z.enum(["text", "voice"]).default("text"),
  /** Si la nota cubre un rango, frame final (nota de rango). */
  frameEnd: z.number().min(0).optional(),
});
export type Marker = z.infer<typeof MarkerSchema>;

export const ProjectSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string(),
  name: z.string().default("Proyecto sin título"),
  // par (yuv420p), acotado: evita renders rotos por dimensiones 0/negativas/absurdas.
  width: z.number().int().min(2).max(7680).default(1920),
  height: z.number().int().min(2).max(7680).default(1080),
  fps: z.number().min(1).max(120).default(30),
  durationInFrames: z.number().int().min(1).default(300),
  backgroundColor: z.string().default("#000000"),
  /** Rendered top-most LAST. tracks[0] is the bottom layer. */
  tracks: z.array(TrackSchema).default([]),
  /** Marcadores / capítulos. */
  markers: z.array(MarkerSchema).default([]),
  /** Motion blur global (null/undefined = off). */
  motionBlur: MotionBlurSchema.nullable().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/** A media asset known to the project (uploaded or AI-generated). */
export const AssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["video", "image", "audio"]),
  src: z.string(),
  durationInFrames: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  thumbnail: z.string().optional(),
  /** Proxy de baja resolución para preview fluido (el render usa el original). */
  proxySrc: z.string().optional(),
});
export type Asset = z.infer<typeof AssetSchema>;
