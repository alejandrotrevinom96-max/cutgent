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
