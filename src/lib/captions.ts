import type { TextClip } from "@/lib/schema";

/**
 * Utilidades de subtítulos: parseo de formatos SRT/VTT, conversión de tiempos a
 * frames, presets de estilo para subtítulos y construcción de inputs de clip de
 * texto. Módulo puro (sin dependencias de React); sólo importa tipos del schema.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Un subtítulo parseado: índice, tiempos en segundos y texto (puede ser multilínea). */
export type Cue = {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
};

/**
 * Props de texto que un preset/override puede aportar a un TextClip. Es un
 * subconjunto de TextClip (sin id/type/start/duration/text) más la posición
 * vertical `y` heredada del transform compartido.
 */
type CaptionStyle = Partial<
  Pick<
    TextClip,
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
    | "color"
    | "strokeColor"
    | "strokeWidth"
    | "shadowColor"
    | "shadowBlur"
    | "textAlign"
    | "y"
  >
>;

// ---------------------------------------------------------------------------
// Parseo de tiempos
// ---------------------------------------------------------------------------

/**
 * Convierte un timestamp "HH:MM:SS,mmm" (SRT) o "HH:MM:SS.mmm" (VTT) a segundos.
 * También tolera la forma corta "MM:SS.mmm". Devuelve NaN si no es válido.
 */
function timestampToSeconds(raw: string): number {
  const trimmed = raw.trim().replace(",", ".");
  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) return NaN;

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) return NaN;

  if (nums.length === 3) {
    const [h, m, s] = nums as [number, number, number];
    return h * 3600 + m * 60 + s;
  }
  const [m, s] = nums as [number, number];
  return m * 60 + s;
}

/** Extrae los timestamps de inicio y fin de una línea "INICIO --> FIN". */
function parseTimeLine(line: string): { startSec: number; endSec: number } | null {
  const match = line.split("-->");
  if (match.length !== 2) return null;
  // El lado derecho puede traer ajustes de posición de WebVTT; tomamos el primer token.
  const startSec = timestampToSeconds(match[0]);
  const endToken = match[1].trim().split(/\s+/)[0] ?? "";
  const endSec = timestampToSeconds(endToken);
  if (Number.isNaN(startSec) || Number.isNaN(endSec)) return null;
  return { startSec, endSec };
}

/** Divide el texto en bloques separados por una o más líneas en blanco; tolera \r\n. */
function splitBlocks(input: string): string[] {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Parsea SRT estándar: bloques separados por línea en blanco, cada uno con un
 * número de índice, una línea "HH:MM:SS,mmm --> HH:MM:SS,mmm" y una o más líneas
 * de texto. Tolera \r\n. Ignora bloques mal formados.
 */
export function parseSRT(srt: string): Cue[] {
  const cues: Cue[] = [];
  let auto = 0;

  for (const block of splitBlocks(srt)) {
    const lines = block.split("\n");
    let i = 0;

    // Línea de índice opcional (numérica).
    let index = NaN;
    if (i < lines.length && /^\d+$/.test(lines[i].trim())) {
      index = Number(lines[i].trim());
      i += 1;
    }

    // Línea de tiempos.
    if (i >= lines.length) continue;
    const times = parseTimeLine(lines[i]);
    if (!times) continue;
    i += 1;

    const text = lines.slice(i).join("\n").trim();
    if (text.length === 0) continue;

    auto += 1;
    cues.push({
      index: Number.isNaN(index) ? auto : index,
      startSec: times.startSec,
      endSec: times.endSec,
      text,
    });
  }

  return cues;
}

/**
 * Parsea WebVTT: cabecera "WEBVTT" inicial, timestamps con '.' como separador de
 * milisegundos. Soporta identificadores de cue opcionales y omite bloques de
 * NOTE/STYLE/REGION. Tolera \r\n.
 */
export function parseVTT(vtt: string): Cue[] {
  const cues: Cue[] = [];
  let auto = 0;

  for (const block of splitBlocks(vtt)) {
    const lines = block.split("\n");
    let i = 0;

    // Saltar la cabecera WEBVTT (con o sin metadatos en la misma línea).
    if (i < lines.length && /^WEBVTT/.test(lines[i].trim())) {
      continue;
    }

    // Ignorar bloques especiales.
    const head = lines[0]?.trim() ?? "";
    if (/^(NOTE|STYLE|REGION)\b/.test(head)) continue;

    // Identificador de cue opcional (línea sin "-->").
    let index = NaN;
    if (i < lines.length && !lines[i].includes("-->")) {
      if (/^\d+$/.test(lines[i].trim())) index = Number(lines[i].trim());
      i += 1;
    }

    // Línea de tiempos.
    if (i >= lines.length) continue;
    const times = parseTimeLine(lines[i]);
    if (!times) continue;
    i += 1;

    const text = lines.slice(i).join("\n").trim();
    if (text.length === 0) continue;

    auto += 1;
    cues.push({
      index: Number.isNaN(index) ? auto : index,
      startSec: times.startSec,
      endSec: times.endSec,
      text,
    });
  }

  return cues;
}

// ---------------------------------------------------------------------------
// Conversión a frames
// ---------------------------------------------------------------------------

/** Convierte segundos a frames redondeando al frame más cercano. */
export function secondsToFrames(sec: number, fps: number): number {
  return Math.round(sec * fps);
}

// ---------------------------------------------------------------------------
// Presets de estilo
// ---------------------------------------------------------------------------

/**
 * Presets de estilo para subtítulos. Cada uno devuelve props compatibles con
 * TextClip del schema. La posición vertical `y` es positiva grande para colocar
 * los subtítulos en la parte inferior del lienzo (origen en el centro).
 */
export const CAPTION_PRESETS: Record<
  "youtube" | "tiktok" | "minimal" | "bold",
  CaptionStyle
> = {
  // YouTube: blanco en negrita con borde negro y sombra inferior, abajo.
  youtube: {
    fontFamily: "Inter",
    fontSize: 64,
    fontWeight: 700,
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 6,
    shadowColor: "rgba(0,0,0,0.85)",
    shadowBlur: 8,
    textAlign: "center",
    y: 380,
  },
  // TikTok: muy grande, centrado, con fondo/realce mediante sombra fuerte.
  tiktok: {
    fontFamily: "Inter",
    fontSize: 96,
    fontWeight: 800,
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 10,
    shadowColor: "rgba(0,0,0,0.6)",
    shadowBlur: 24,
    textAlign: "center",
    y: 0,
  },
  // Minimal: limpio, sin borde ni sombra.
  minimal: {
    fontFamily: "Inter",
    fontSize: 56,
    fontWeight: 500,
    color: "#ffffff",
    strokeWidth: 0,
    shadowBlur: 0,
    textAlign: "center",
    y: 380,
  },
  // Bold: amarillo grande con borde negro marcado.
  bold: {
    fontFamily: "Inter",
    fontSize: 88,
    fontWeight: 900,
    color: "#ffe000",
    strokeColor: "#000000",
    strokeWidth: 8,
    shadowColor: "rgba(0,0,0,0.8)",
    shadowBlur: 10,
    textAlign: "center",
    y: 360,
  },
};

// ---------------------------------------------------------------------------
// Conversión de cues a inputs de clip
// ---------------------------------------------------------------------------

/**
 * Convierte cada cue en un input listo para `createClip('text', input)`:
 * `start` y `duration` en frames (duración mínima de 1 frame), el `text` del cue
 * y las props del preset elegido más overrides (`fontSize`, `y`). NO genera id
 * ni type; el llamador construye el clip.
 */
export function cuesToClipInputs(
  cues: Cue[],
  opts: {
    fps: number;
    preset?: keyof typeof CAPTION_PRESETS;
    fontSize?: number;
    y?: number;
  },
): Array<{ start: number; duration: number; text: string } & Record<string, unknown>> {
  const style: CaptionStyle = opts.preset ? CAPTION_PRESETS[opts.preset] : {};

  return cues.map((cue) => {
    const start = secondsToFrames(cue.startSec, opts.fps);
    const duration = Math.max(1, secondsToFrames(cue.endSec - cue.startSec, opts.fps));

    return {
      ...style,
      ...(opts.fontSize !== undefined ? { fontSize: opts.fontSize } : {}),
      ...(opts.y !== undefined ? { y: opts.y } : {}),
      start,
      duration,
      text: cue.text,
    };
  });
}
