import "server-only";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import ffmpegStatic from "ffmpeg-static";
import {
  pipeline,
  env,
  AutoProcessor,
  WhisperForConditionalGeneration,
  Tensor,
} from "@huggingface/transformers";
import { resolveMediaInput } from "./media-source";
import { hasAudioStream } from "./audio-tools";
import { dataDir, modelsDir } from "./paths";

/**
 * Transcripción 100% LOCAL (Whisper vía onnxruntime, sin APIs). Extrae el audio
 * con ffmpeg, lo pasa por el modelo y devuelve segmentos con timestamps. El
 * modelo se descarga una sola vez a ./models y se reutiliza entre peticiones.
 * Esto es lo que me permite (Claude) LEER el contenido y elegir los clips.
 */

env.cacheDir = modelsDir();
env.allowLocalModels = true;

const TRANSCRIPTS_DIR = dataDir("transcripts");
const DEFAULT_MODEL = "Xenova/whisper-base";
/**
 * Modelo para el DICTADO de notas (clips cortos). En español `whisper-base` da
 * 11–18% WER y falla justo en números/timestamps; `whisper-small` baja a ~6–10%.
 * Por defecto reusa el modelo base (ya descargado, cero sorpresas); el dueño
 * puede subir calidad con CUTGENT_DICTATION_MODEL=Xenova/whisper-small.
 */
const DICTATION_MODEL = process.env.CUTGENT_DICTATION_MODEL || DEFAULT_MODEL;

export interface TranscriptSegment {
  start: number; // segundos
  end: number;
  text: string;
}
export interface Transcript {
  src: string;
  language: string;
  durationSec: number;
  model: string;
  segments: TranscriptSegment[];
}

/** Una palabra con timing (segundos). Para captions animados (karaoke). */
export interface WordStamp {
  text: string;
  start: number; // segundos
  end: number;
}
export interface WordTranscript {
  src: string;
  language: string;
  durationSec: number;
  model: string;
  words: WordStamp[];
}

// Cache del pipeline en globalThis (sobrevive hot-reload; cargar el modelo es caro).
const g = globalThis as unknown as {
  __cutgent_asr?: Promise<unknown>;
  __cutgent_dictation_asr?: Promise<unknown>;
  __cutgent_detector?: Promise<{ processor: unknown; model: unknown }>;
};
function getAsr(): Promise<unknown> {
  if (!g.__cutgent_asr) {
    g.__cutgent_asr = pipeline("automatic-speech-recognition", DEFAULT_MODEL, { dtype: "q8" });
  }
  return g.__cutgent_asr;
}

function getDictationAsr(): Promise<unknown> {
  if (DICTATION_MODEL === DEFAULT_MODEL) return getAsr();
  if (!g.__cutgent_dictation_asr) {
    g.__cutgent_dictation_asr = pipeline("automatic-speech-recognition", DICTATION_MODEL, {
      dtype: "q8",
    });
  }
  return g.__cutgent_dictation_asr;
}

// Modelo + processor a bajo nivel para la detección de idioma (langid de Whisper).
function getDetector(): Promise<{ processor: unknown; model: unknown }> {
  if (!g.__cutgent_detector) {
    g.__cutgent_detector = Promise.all([
      AutoProcessor.from_pretrained(DEFAULT_MODEL),
      WhisperForConditionalGeneration.from_pretrained(DEFAULT_MODEL, { dtype: "q8" }),
    ]).then(([processor, model]) => ({ processor, model }));
  }
  return g.__cutgent_detector;
}

const resolveInput = (src: string) => resolveMediaInput(src, TRANSCRIPTS_DIR);

/** Extrae una muestra de audio (mono 16k f32) desde offsetSec durante durSec. */
function extractAudioSample(file: string, offsetSec: number, durSec: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) return reject(new Error("ffmpeg-static no disponible"));
    const proc = spawn(ffmpegStatic, [
      "-ss", String(offsetSec), "-t", String(durSec),
      "-i", file, "-ar", "16000", "-ac", "1", "-f", "f32le", "-",
    ]);
    const chunks: Buffer[] = [];
    let err = "";
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg salió ${code}: ${err.slice(-300)}`));
      const buf = Buffer.concat(chunks);
      const usable = buf.length - (buf.length % 4);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + usable);
      resolve(new Float32Array(ab));
    });
  });
}

export interface LanguageDetection {
  language: string;
  confidence: number;
  /** true si el modelo está suficientemente seguro como para no preguntar. */
  confident: boolean;
  top: { language: string; prob: number }[];
}

/**
 * Detección de idioma estilo Whisper: un solo paso de decodificación desde el
 * token inicial y softmax sobre los tokens de idioma. NO fuerza ningún idioma.
 */
/** Duración en segundos vía ffmpeg (parse de "Duration:" en stderr). 0 si falla. */
function probeDurationSec(file: string): Promise<number> {
  return new Promise((resolve) => {
    if (!ffmpegStatic) return resolve(0);
    const proc = spawn(ffmpegStatic, ["-i", file]);
    let err = "";
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", () => resolve(0));
    proc.on("close", () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0);
    });
  });
}

export async function detectLanguage(src: string): Promise<LanguageDetection> {
  const { file, cleanup } = await resolveInput(src);
  try {
    if (!(await hasAudioStream(file))) throw new Error("El clip no tiene pista de audio para transcribir.");
    // Muestra de 30s ~al 20% del audio (evita intros musicales/silencios al inicio).
    const dur = await probeDurationSec(file);
    const offset = dur > 60 ? Math.floor(dur * 0.2) : 0;
    const probe = await extractAudioSample(file, offset, 30);
    let audio = probe;
    if (probe.length < 16000) audio = await extractAudio(file); // muy corto: todo
    const { processor, model } = await getDetector();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proc = processor as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = model as any;
    const inputs = await proc(audio);
    const startId: number =
      m.generation_config?.decoder_start_token_id ?? m.config?.decoder_start_token_id;
    const decoderInputIds = new Tensor("int64", new BigInt64Array([BigInt(startId)]), [1, 1]);
    const out = await m({ input_features: inputs.input_features, decoder_input_ids: decoderInputIds });
    const logits: Float32Array = out.logits.data as Float32Array; // [1,1,vocab] → vocab
    const langToId: Record<string, number> = m.generation_config.lang_to_id;

    let maxLogit = -Infinity;
    const raw: { language: string; logit: number }[] = [];
    for (const [tok, id] of Object.entries(langToId)) {
      const logit = logits[id as number];
      raw.push({ language: tok.slice(2, -2), logit });
      if (logit > maxLogit) maxLogit = logit;
    }
    let sum = 0;
    for (const r of raw) sum += Math.exp(r.logit - maxLogit);
    const top = raw
      .map((r) => ({ language: r.language, prob: Math.exp(r.logit - maxLogit) / sum }))
      .sort((a, b) => b.prob - a.prob);

    const confidence = top[0].prob;
    const gap = confidence - (top[1]?.prob ?? 0);
    const confident = confidence >= 0.6 && gap >= 0.15;
    return { language: top[0].language, confidence, confident, top: top.slice(0, 5) };
  } finally {
    if (cleanup) await cleanup();
  }
}

function extractAudio(file: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) return reject(new Error("ffmpeg-static no disponible"));
    const proc = spawn(ffmpegStatic, ["-i", file, "-ar", "16000", "-ac", "1", "-f", "f32le", "-"]);
    const chunks: Buffer[] = [];
    let err = "";
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg salió ${code}: ${err.slice(-300)}`));
      const buf = Buffer.concat(chunks);
      const usable = buf.length - (buf.length % 4);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + usable);
      resolve(new Float32Array(ab));
    });
  });
}

// El caché se indexa por src + idioma (el mismo video puede transcribirse en
// distintos idiomas y cada uno es un transcript distinto).
const cacheKey = (src: string, language: string) =>
  crypto.createHash("md5").update(`${src}|${language}`).digest("hex");
const cacheFile = (src: string, language: string) =>
  path.join(TRANSCRIPTS_DIR, `${cacheKey(src, language)}.json`);

export async function getCachedTranscript(
  src: string,
  language = "default",
): Promise<Transcript | null> {
  try {
    return JSON.parse(await fs.readFile(cacheFile(src, language), "utf8")) as Transcript;
  } catch {
    return null;
  }
}

// Caché de palabras (karaoke), separada de la de segmentos (distinto shape).
const wordsCacheFile = (src: string, language: string) =>
  path.join(TRANSCRIPTS_DIR, `${cacheKey(src, language)}.words.json`);

export async function getCachedWords(
  src: string,
  language = "default",
): Promise<WordTranscript | null> {
  try {
    return JSON.parse(await fs.readFile(wordsCacheFile(src, language), "utf8")) as WordTranscript;
  } catch {
    return null;
  }
}

/**
 * Transcripción a nivel de PALABRA (karaoke), local. Usa el mismo modelo q8 ya
 * cacheado (whisper-base trae alignment_heads). chunk_length_s:29 evita el bug de
 * borde a 30s. Sanea el shape de transformers.js: cada chunk es UNA palabra con
 * `text` con espacio inicial y `timestamp:[start, end|null]`.
 */
export async function transcribeWords(
  src: string,
  opts: { language?: string } = {},
): Promise<WordTranscript> {
  const { file, cleanup } = await resolveInput(src);
  try {
    if (!(await hasAudioStream(file))) throw new Error("El clip no tiene pista de audio para transcribir.");
    const audio = await extractAudio(file);
    if (audio.length < 1600) throw new Error("Audio insuficiente o sin pista de audio (< 0.1s).");
    const durationSec = audio.length / 16000;
    const asr = (await getAsr()) as (
      a: Float32Array,
      o: Record<string, unknown>,
    ) => Promise<{ text: string; chunks?: AsrChunk[] }>;

    const out = await asr(audio, {
      return_timestamps: "word",
      chunk_length_s: 29,
      stride_length_s: 5,
      ...(opts.language ? { language: opts.language } : {}),
    });

    // Saneado: trim del espacio inicial, descarta vacías, resuelve end null y
    // garantiza orden monótono (end>=start, start>=prev.end).
    const raw = (out.chunks ?? [])
      .map((c) => ({ text: (c.text ?? "").trim(), start: c.timestamp[0] ?? 0, end: c.timestamp[1] }))
      .filter((w) => w.text.length > 0);
    const MIN_WORD_SEC = 1 / 30; // ancho mínimo: garantiza end > start (1 frame @30fps)
    const words: WordStamp[] = [];
    for (let i = 0; i < raw.length; i++) {
      const w = raw[i];
      const nextStart = raw[i + 1]?.start ?? null;
      let end = w.end ?? nextStart ?? durationSec;
      let start = w.start;
      const prev = words[words.length - 1];
      if (prev && start < prev.end) start = prev.end; // sin solapes
      // Fuerza end > start SIEMPRE (palabras sub-frame o colapsadas por el clamp
      // anti-solape no se resaltarían nunca; el render usa frame < end exclusivo).
      if (end < start + MIN_WORD_SEC) end = start + MIN_WORD_SEC;
      words.push({ text: w.text, start, end });
    }

    const transcript: WordTranscript = {
      src,
      language: opts.language ?? "auto",
      durationSec,
      model: DEFAULT_MODEL,
      words,
    };
    await fs.mkdir(TRANSCRIPTS_DIR, { recursive: true });
    await fs.writeFile(wordsCacheFile(src, opts.language ?? "default"), JSON.stringify(transcript), "utf8");
    return transcript;
  } finally {
    if (cleanup) await cleanup();
  }
}

interface AsrChunk {
  timestamp: [number, number | null];
  text: string;
}

export async function transcribeSource(
  src: string,
  opts: { language?: string } = {},
): Promise<Transcript> {
  const { file, cleanup } = await resolveInput(src);
  try {
    if (!(await hasAudioStream(file))) throw new Error("El clip no tiene pista de audio para transcribir.");
    const audio = await extractAudio(file);
    if (audio.length < 1600) throw new Error("Audio insuficiente o sin pista de audio (< 0.1s).");
    const durationSec = audio.length / 16000;
    const asr = (await getAsr()) as (
      a: Float32Array,
      o: Record<string, unknown>,
    ) => Promise<{ text: string; chunks?: AsrChunk[] }>;

    const out = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(opts.language ? { language: opts.language } : {}),
    });

    const segments: TranscriptSegment[] = (out.chunks ?? []).map((c) => ({
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? durationSec,
      text: c.text.trim(),
    }));
    if (segments.length === 0 && out.text) {
      segments.push({ start: 0, end: durationSec, text: out.text.trim() });
    }

    const transcript: Transcript = {
      src,
      language: opts.language ?? "auto",
      durationSec,
      model: DEFAULT_MODEL,
      segments,
    };
    await fs.mkdir(TRANSCRIPTS_DIR, { recursive: true });
    await fs.writeFile(cacheFile(src, opts.language ?? "default"), JSON.stringify(transcript), "utf8");
    return transcript;
  } finally {
    if (cleanup) await cleanup();
  }
}

/**
 * Transcribe un clip de audio corto desde un Buffer (dictado de notas). Escribe
 * a un temp que controlamos nosotros (no pasa por resolveMediaInput porque no es
 * input del usuario sino bytes de su micro), extrae audio y corre el ASR de
 * dictado. Devuelve solo texto (sin timestamps).
 */
export async function transcribeAudioBuffer(
  buf: Buffer,
  opts: { language?: string; ext?: string } = {},
): Promise<string> {
  const dir = dataDir("tmp");
  await fs.mkdir(dir, { recursive: true });
  const ext = (opts.ext || "webm").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "webm";
  const tmp = path.join(dir, `dictation_${crypto.randomBytes(6).toString("hex")}.${ext}`);
  await fs.writeFile(tmp, buf);
  try {
    const audio = await extractAudio(tmp);
    if (audio.length < 1600) return ""; // < 0.1s de audio útil
    const asr = (await getDictationAsr()) as (
      a: Float32Array,
      o: Record<string, unknown>,
    ) => Promise<{ text: string }>;
    const out = await asr(audio, {
      chunk_length_s: 30,
      ...(opts.language ? { language: opts.language } : {}),
    });
    return (out.text ?? "").trim();
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}

// --- Jobs en memoria (la transcripción de un video largo tarda) -------------

export interface TranscribeJob {
  id: string;
  status: "running" | "done" | "error";
  src: string;
  language: string;
  kind: "segments" | "words";
  error?: string;
}
const jobs = (globalThis as unknown as { __cutgent_tjobs?: Map<string, TranscribeJob> });
function jobMap(): Map<string, TranscribeJob> {
  if (!jobs.__cutgent_tjobs) jobs.__cutgent_tjobs = new Map();
  return jobs.__cutgent_tjobs;
}
export function getTranscribeJob(id: string): TranscribeJob | undefined {
  return jobMap().get(id);
}
export function startTranscribeJob(
  id: string,
  src: string,
  language?: string,
  kind: "segments" | "words" = "segments",
): void {
  jobMap().set(id, { id, status: "running", src, language: language ?? "default", kind });
  const evict = () => setTimeout(() => jobMap().delete(id), 10 * 60 * 1000).unref?.();
  const run = kind === "words" ? transcribeWords(src, { language }) : transcribeSource(src, { language });
  void run
    .then(() => {
      const j = jobMap().get(id);
      if (j) j.status = "done";
      evict();
    })
    .catch((err: unknown) => {
      const j = jobMap().get(id);
      if (j) {
        j.status = "error";
        j.error = err instanceof Error ? err.message : String(err);
      }
      evict();
    });
}
