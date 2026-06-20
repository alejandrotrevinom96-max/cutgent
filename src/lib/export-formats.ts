/**
 * Formatos de exportación curados (subset de los códecs que soporta
 * @remotion/renderer). Mapea cada formato a su códec/contenedor/opciones. El
 * mapa es la ÚNICA fuente de la extensión de salida (antes estaba hardcodeada
 * a .mp4). Valores verificados contra node_modules/@remotion/renderer:
 *   validCodecs, proResProfileOptions, supportedAudioCodecs.
 */

export type ExportFormat = "h264" | "prores" | "vp9" | "gif";

export interface ExportSpec {
  /** Remotion Codec. */
  codec: "h264" | "prores" | "vp9" | "gif";
  /** Extensión del contenedor (cada códec exige el suyo). */
  ext: "mp4" | "mov" | "webm" | "gif";
  proResProfile?: "4444-xq" | "4444" | "hq" | "standard" | "light" | "proxy";
  audioCodec?: "aac" | "pcm-16" | "opus";
  label: string;
}

export const EXPORT_FORMATS: Record<ExportFormat, ExportSpec> = {
  h264: { codec: "h264", ext: "mp4", audioCodec: "aac", label: "MP4 (H.264)" },
  prores: { codec: "prores", ext: "mov", proResProfile: "hq", audioCodec: "pcm-16", label: "ProRes (.mov)" },
  vp9: { codec: "vp9", ext: "webm", audioCodec: "opus", label: "WebM (VP9)" },
  gif: { codec: "gif", ext: "gif", label: "GIF (sin audio)" },
};

export const DEFAULT_EXPORT_FORMAT: ExportFormat = "h264";

export function resolveExportFormat(format: string | undefined): ExportSpec {
  return EXPORT_FORMATS[(format as ExportFormat) ?? DEFAULT_EXPORT_FORMAT] ?? EXPORT_FORMATS.h264;
}

/** Presets de calidad → CRF (h264/vp9). Menor = mejor calidad / más peso. */
export type ExportQuality = "high" | "balanced" | "fast";
export const QUALITY_CRF: Record<ExportQuality, number> = { high: 18, balanced: 23, fast: 28 };

/** Preset de export por lotes. width/height undefined = usa las dims del proyecto
 *  (solo cambia el formato). Con width/height se re-renderiza a esas dims. */
export interface SocialPreset {
  id: string;
  label: string;
  format: ExportFormat;
  quality: ExportQuality;
  gpu: boolean;
  width?: number;
  height?: number;
}
export const SOCIAL_PRESETS: SocialPreset[] = [
  { id: "yt-1080p", label: "YouTube 1080p (MP4)", format: "h264", quality: "high", gpu: true, width: 1920, height: 1080 },
  { id: "yt-4k", label: "YouTube 4K (MP4)", format: "h264", quality: "high", gpu: true, width: 3840, height: 2160 },
  { id: "shorts", label: "Shorts/Reels/TikTok 9:16", format: "h264", quality: "high", gpu: true, width: 1080, height: 1920 },
  { id: "square", label: "Instagram 1:1", format: "h264", quality: "balanced", gpu: true, width: 1080, height: 1080 },
  { id: "portrait45", label: "Instagram 4:5", format: "h264", quality: "balanced", gpu: true, width: 1080, height: 1350 },
  { id: "web-vp9", label: "Web ligero (WebM/VP9)", format: "vp9", quality: "balanced", gpu: false },
  { id: "gif", label: "GIF (sin audio)", format: "gif", quality: "fast", gpu: false },
];
export const SOCIAL_PRESET_IDS = SOCIAL_PRESETS.map((p) => p.id) as [string, ...string[]];
