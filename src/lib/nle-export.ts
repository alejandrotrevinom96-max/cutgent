import type { Project, Track, Clip } from "./schema";

/**
 * Export de la línea de tiempo a XML de NLE para CONTINUAR el proyecto en otro
 * editor (Premiere Pro / DaVinci Resolve). Formato primario: FCP7 "XMEML" v5,
 * el único interchange que importa NATIVO en Premiere Y Resolve sin plugin.
 *
 * Módulo PURO (sin fs/path/url/server-only): determinista y testeable. El
 * llamador (la ruta API) reescribe antes los `src` de los clips a URIs `file://`
 * absolutas en disco, porque un NLE externo no resuelve las rutas HTTP `/assets`.
 *
 * ALCANCE = handoff de corte/timeline, NO round-trip de efectos. Exporta
 * video/imagen/audio con in/out/posición/velocidad. Texto, formas y sólidos NO
 * se exportan (no hay equivalente importable fiable) → se reportan en `warnings`
 * para que el usuario los recree en su editor. No exporta transform/keyframes/
 * color/máscara/blend. Pasa `opts.warnings` (array mutable) para recoger avisos.
 */

export type NleFormat = "fcp7" | "fcpxml";
export type MediaUriResolver = (src: string) => string;
export interface NleExportOptions {
  resolveUri?: MediaUriResolver;
  sequenceName?: string;
  /** Array mutable donde se acumulan avisos (clips no exportados, src remotos…). */
  warnings?: string[];
}

export const NLE_EXT: Record<NleFormat, string> = { fcp7: "xml", fcpxml: "fcpxml" };
export const NLE_MIME: Record<NleFormat, string> = { fcp7: "application/xml", fcpxml: "application/xml" };

export function nleFileName(doc: Project, format: NleFormat): string {
  const base = (doc.name || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "proyecto";
  return `${base}.${NLE_EXT[format]}`;
}

function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function computeRate(fps: number): { timebase: number; ntsc: "TRUE" | "FALSE"; df: "DF" | "NDF" } {
  const timebase = Math.max(1, Math.round(fps));
  const isNtsc = Math.abs(fps - (timebase * 1000) / 1001) < Math.abs(fps - timebase);
  const ntsc = isNtsc ? "TRUE" : "FALSE";
  const df = isNtsc && (timebase === 30 || timebase === 60) ? "DF" : "NDF";
  return { timebase, ntsc, df };
}

const rateXml = (r: { timebase: number; ntsc: string }) =>
  `<rate><timebase>${r.timebase}</timebase><ntsc>${r.ntsc}</ntsc></rate>`;
const timecodeXml = (r: { timebase: number; ntsc: string; df: string }) =>
  `<timecode>${rateXml(r)}<string>00:00:00:00</string><frame>0</frame><displayformat>${r.df}</displayformat></timecode>`;

const isAudioTrack = (t: Track) => t.kind === "audio";
type SrcClip = Extract<Clip, { src: string }>;
const hasSrc = (c: Clip): c is SrcClip => "src" in c && typeof (c as { src?: unknown }).src === "string";

function sourceInOut(c: Clip): { inF: number; outF: number; rate: number } {
  const rate = "playbackRate" in c && (c as { playbackRate?: number }).playbackRate ? (c as { playbackRate: number }).playbackRate : 1;
  const inF = "trimStart" in c && typeof (c as { trimStart?: number }).trimStart === "number" ? (c as { trimStart: number }).trimStart : 0;
  const outF = inF + Math.round(c.duration * rate); // imagen: rate=1, trimStart=0 → out=duration
  return { inF, outF, rate };
}

/** Último segmento de una ruta/URL, decodificado de forma segura (no revienta con `%`). */
function basename(src: string): string {
  const clean = src.split(/[?#]/)[0];
  const last = clean.split(/[/\\]/).pop() || src;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

const CLIP_LABEL: Record<string, string> = { text: "texto", shape: "forma", solid: "sólido", video: "video", image: "imagen", audio: "audio" };

// --- FCP7 XMEML ------------------------------------------------------------
export function toFcp7Xml(doc: Project, opts: NleExportOptions = {}): string {
  const resolveUri = opts.resolveUri ?? ((s) => s);
  const warn = (m: string) => { if (opts.warnings) opts.warnings.push(m); };
  const r = computeRate(doc.fps);
  const seqRate = rateXml(r);

  // ¿es la fuente exportable en ESTA pista? (audio→audio; media→video/imagen)
  const exportableHere = (c: Clip, track: Track): c is SrcClip =>
    isAudioTrack(track) ? c.type === "audio" : c.type === "video" || c.type === "image";

  // PASS 1 — duración real (máx out) por src, para que <file><duration> sea correcto.
  const fileMaxOut = new Map<string, number>();
  for (const t of doc.tracks) {
    for (const c of t.clips) {
      if (hasSrc(c) && exportableHere(c, t)) {
        fileMaxOut.set(c.src, Math.max(fileMaxOut.get(c.src) ?? 0, sourceInOut(c).outF));
      }
    }
  }

  const sampleVideo = `<samplecharacteristics>${seqRate}<width>${doc.width}</width><height>${doc.height}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics>`;
  const fileAudioMedia = `<media><audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount><audiochannel><sourcechannel>1</sourcechannel></audiochannel><audiochannel><sourcechannel>2</sourcechannel></audiochannel></audio></media>`;

  const fileIds = new Map<string, string>();
  let fileCounter = 0;
  const fileXml = (src: string, kind: "video" | "image" | "audio"): string => {
    const existing = fileIds.get(src);
    if (existing) return `<file id="${existing}"/>`;
    const id = `file-${++fileCounter}`;
    fileIds.set(src, id);
    const uri = resolveUri(src);
    if (!/^file:/i.test(uri)) {
      warn(`El medio "${basename(src)}" no es un archivo local (${uri.slice(0, 48)}…); aparecerá OFFLINE en tu editor — descárgalo y vuelve a vincularlo.`);
    }
    const out = fileMaxOut.get(src) ?? 1;
    const media =
      kind === "audio"
        ? fileAudioMedia
        : kind === "image"
          ? `<media><video>${sampleVideo}</video></media>`
          : `<media><video>${sampleVideo}</video>${fileAudioMedia.replace(/^<media>|<\/media>$/g, "")}</media>`;
    return `<file id="${id}"><name>${xmlEscape(basename(src))}</name><pathurl>${xmlEscape(uri)}</pathurl>${seqRate}<duration>${out}</duration>${timecodeXml(r)}${media}</file>`;
  };

  // clipitem en el ORDEN del DTD FCP7: name,duration,rate,start,end,enabled,in,out,file,sourcetrack,compositemode.
  let itemCounter = 0;
  const mediaClipItem = (c: SrcClip, kind: "video" | "image" | "audio"): string => {
    const { inF, outF } = sourceInOut(c);
    const start = c.start;
    const end = c.start + c.duration;
    const sourcetrack = kind === "audio" ? `<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>` : "";
    return (
      `<clipitem id="clipitem-${++itemCounter}">` +
      `<name>${xmlEscape(c.name || basename(c.src))}</name>` +
      `<duration>${outF - inF}</duration>${seqRate}` +
      `<start>${start}</start><end>${end}</end>` +
      `<enabled>TRUE</enabled>` +
      `<in>${inF}</in><out>${outF}</out>` +
      fileXml(c.src, kind) +
      sourcetrack +
      `<compositemode>normal</compositemode>` +
      `</clipitem>`
    );
  };

  // Pistas de video (tracks[0] = fondo = V1; sin invertir el orden del array).
  const videoTracksXml = doc.tracks
    .filter((t) => !isAudioTrack(t))
    .map((t) => {
      const items = t.clips
        .map((c) => {
          if (c.type === "video") return mediaClipItem(c, "video");
          if (c.type === "image") return mediaClipItem(c, "image");
          if (c.type === "text" || c.type === "shape" || c.type === "solid") {
            warn(`Clip de ${CLIP_LABEL[c.type]} "${c.name}" no se exporta a XML; recréalo en tu editor.`);
            return "";
          }
          if (c.type === "audio") warn(`Clip de audio "${c.name}" está en una pista de video; no se exportó.`);
          return "";
        })
        .join("");
      return `<track>${items}<enabled>${t.hidden ? "FALSE" : "TRUE"}</enabled><locked>${t.locked ? "TRUE" : "FALSE"}</locked></track>`;
    })
    .join("");

  // Pistas de audio.
  const audioTracksXml = doc.tracks
    .filter(isAudioTrack)
    .map((t, i) => {
      const items = t.clips
        .map((c) => {
          if (c.type === "audio") return mediaClipItem(c, "audio");
          warn(`Clip de ${CLIP_LABEL[c.type] ?? c.type} "${c.name}" está en una pista de audio; no se exportó.`);
          return "";
        })
        .join("");
      return `<track>${items}<enabled>${t.muted ? "FALSE" : "TRUE"}</enabled><locked>${t.locked ? "TRUE" : "FALSE"}</locked><outputchannelindex>${(i % 2) + 1}</outputchannelindex></track>`;
    })
    .join("");

  const name = xmlEscape(opts.sequenceName ?? doc.name ?? "Secuencia");
  const audioFormat = `<format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>`;
  const audioOutputs = `<outputs><group><index>1</index><numchannels>2</numchannels><downmix>0</downmix><channel><index>1</index></channel><channel><index>2</index></channel></group></outputs>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<!DOCTYPE xmeml>` +
    `<xmeml version="5">` +
    `<sequence id="sequence-1"><name>${name}</name><duration>${doc.durationInFrames}</duration>${seqRate}` +
    `${timecodeXml(r)}<in>-1</in><out>-1</out>` +
    `<media>` +
    `<video><format>${sampleVideo}</format>${videoTracksXml}</video>` +
    `<audio><numOutputChannels>2</numOutputChannels>${audioFormat}${audioOutputs}${audioTracksXml}</audio>` +
    `</media></sequence></xmeml>`
  );
}

// --- FCPXML (diferido a una iteración posterior) ---------------------------
export function toFcpXml(_doc: Project, _opts: NleExportOptions = {}): string {
  throw new Error("FCPXML aún no está disponible; usa el XML de FCP7 (importa en Premiere y DaVinci Resolve).");
}

export function exportNle(doc: Project, format: NleFormat, opts: NleExportOptions = {}): string {
  return format === "fcpxml" ? toFcpXml(doc, opts) : toFcp7Xml(doc, opts);
}
