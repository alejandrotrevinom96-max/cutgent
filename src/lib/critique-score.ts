/**
 * Scoring editorial PURO (sin I/O, sin server-only → determinista y testeable).
 * Convierte principios de edición en métricas computables sobre el documento +
 * datos de audio ya calculados (beats/silencios/loudness). El I/O de audio vive
 * en critique.ts; esto solo razona sobre datos. El veredicto holístico lo da el
 * agente leyendo el scorecard — NO es gusto aprendido de audiencia (eso es futuro).
 */
import type { Project, Track, Clip } from "./schema";
import type { BeatAnalysis } from "./beats-dsp";
import type { Loudness } from "./audio-tools";

export type Severity = "info" | "warn" | "high";

export interface CritiqueFinding {
  dimension: string;
  severity: Severity;
  frame?: number;
  atSec?: number;
  message: string;
  fix?: string;
}
export interface DimensionScore {
  dimension: string;
  score: number; // 0..100
  applicable: boolean;
  weight: number;
  findings: CritiqueFinding[];
}
export interface Scorecard {
  overall: number;
  dimensions: DimensionScore[];
  meta: {
    durationSec: number;
    fps: number;
    musicClipId: string | null;
    voiceClipId: string | null;
    bpm: number | null;
    targetLufs: number;
    degraded: string[];
  };
}
export interface CritiqueOpts {
  targetLufs?: number;
  /** Fuerza qué clip de audio es música/voz (por id) cuando la heurística por
   *  nombre falla. Si el id no existe / no es audio, cae a la heurística. */
  musicClipId?: string;
  voiceClipId?: string;
}
export interface AudioInputs {
  beat: BeatAnalysis | null;
  sil: { silences: { start: number; end: number }[] } | null;
  loud: Loudness | null;
  musicClip: Clip | null;
  voiceClip: Clip | null;
  degraded: string[];
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
type AudioFields = { src?: string; start: number; duration: number; trimStart?: number; playbackRate?: number };
const asAudio = (c: Clip) => c as unknown as AudioFields;

// ---- selección de pista música / voz (heurística por nombre, fallback por duración) ----
const MUSIC_RE = /\b(audio|music|música|musik|sfx|background|bgm|instrumental|beat|song|track)\b/i;
const VOICE_RE = /\b(voice|voz|vo|narraci[oó]n|dialog|di[aá]logo|speech|mic|locuci[oó]n)\b/i;

function audioClips(tracks: Track[]): { track: Track; clip: Clip }[] {
  const out: { track: Track; clip: Clip }[] = [];
  for (const t of tracks) for (const c of t.clips) if (c.type === "audio") out.push({ track: t, clip: c });
  return out;
}
const nameOf = (t: Track, c: Clip) => `${c.name ?? ""} ${t.name ?? ""}`;

/** Clip de audio por id en cualquier track; null si no existe o no es audio. */
function findAudioById(tracks: Track[], id: string): Clip | null {
  for (const t of tracks) {
    const c = t.clips.find((c) => c.id === id && c.type === "audio");
    if (c) return c;
  }
  return null;
}

export function selectMusicClip(tracks: Track[], overrideId?: string): Clip | null {
  if (overrideId) {
    const forced = findAudioById(tracks, overrideId);
    if (forced) return forced; // id no encontrado → cae a la heurística (no devuelve null)
  }
  const all = audioClips(tracks);
  const byName = all.find((x) => MUSIC_RE.test(nameOf(x.track, x.clip)) && !VOICE_RE.test(nameOf(x.track, x.clip)));
  if (byName) return byName.clip;
  return all.reduce<Clip | null>((m, x) => (!m || x.clip.duration > m.duration ? x.clip : m), null);
}
export function selectVoiceClip(tracks: Track[], overrideId?: string, musicClip?: Clip | null): Clip | null {
  if (overrideId) {
    const forced = findAudioById(tracks, overrideId);
    if (forced) return forced;
  }
  const all = audioClips(tracks);
  const byName = all.find((x) => VOICE_RE.test(nameOf(x.track, x.clip)));
  if (byName) return byName.clip;
  const music = musicClip !== undefined ? musicClip : selectMusicClip(tracks);
  const cands = all.filter((x) => x.clip.id !== music?.id);
  if (!cands.length) return null;
  return cands.reduce<Clip | null>((m, x) => (!m || x.clip.duration < m.duration ? x.clip : m), null);
}

const VISUAL = new Set(["video", "image", "text", "shape", "solid"]);
function visualClips(visualTracks: Track[]): Clip[] {
  return visualTracks.flatMap((t) => t.clips).filter((c) => VISUAL.has(c.type));
}
function cutFrames(visualTracks: Track[]): number[] {
  const s = new Set<number>();
  for (const t of visualTracks) for (const c of t.clips) {
    if (VISUAL.has(c.type)) {
      s.add(c.start);
      s.add(c.start + c.duration);
    }
  }
  return [...s].sort((a, b) => a - b);
}
function mergeRanges(rs: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = rs.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}
const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

// ---------------------------------------------------------------------------
// Dimensiones
// ---------------------------------------------------------------------------

function scoreCadence(visualTracks: Track[], fps: number): DimensionScore {
  const clips = visualClips(visualTracks);
  if (clips.length === 0)
    return { dimension: "cadence", score: 50, applicable: false, weight: 1.0, findings: [{ dimension: "cadence", severity: "info", message: "Sin clips visuales." }] };

  const findings: CritiqueFinding[] = [];
  const cuts = cutFrames(visualTracks);
  let gapPenalty = 0;
  for (let i = 0; i < cuts.length - 1; i++) {
    const gap = cuts[i + 1] - cuts[i];
    if (gap > 5 * fps) {
      const sev: Severity = gap > 10 * fps ? "high" : "warn";
      gapPenalty += sev === "high" ? 25 : 12;
      findings.push({
        dimension: "cadence",
        severity: sev,
        frame: cuts[i],
        atSec: +(cuts[i] / fps).toFixed(2),
        message: `Tramo de ${(gap / fps).toFixed(1)}s sin corte`,
        fix: `split_clip frame=${Math.round(cuts[i] + gap / 2)} (parte el clip que cubre ese frame)`,
      });
    }
  }
  let cvScore: number;
  if (clips.length < 3) {
    cvScore = 65; // muy pocos clips para juzgar variedad; el score lo dominan los gaps
  } else {
    const ds = clips.map((c) => c.duration);
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    const std = Math.sqrt(ds.reduce((a, b) => a + (b - mean) * (b - mean), 0) / ds.length);
    const cv = mean > 0 ? std / mean : 0;
    cvScore = cv < 0.15 ? 55 : cv > 1.2 ? clamp(100 - (cv - 1.2) * 50) : 100 - Math.abs(cv - 0.55) * 40;
    if (cv < 0.15) findings.push({ dimension: "cadence", severity: "info", message: "Duraciones muy uniformes (cadencia robótica); varía la longitud de los planos." });
  }
  return { dimension: "cadence", score: Math.round(clamp(cvScore - gapPenalty)), applicable: true, weight: 1.0, findings };
}

function scoreBeatAlignment(visualTracks: Track[], beat: BeatAnalysis | null, music: Clip | null, fps: number): DimensionScore {
  if (!beat || beat.bpm == null || beat.beats.length === 0 || !music) {
    return {
      dimension: "beat_alignment",
      score: 50,
      applicable: false,
      weight: 0.8,
      findings: [{ dimension: "beat_alignment", severity: "info", message: "Sin pista de música con tempo claro; no se evalúa corte-al-beat." }],
    };
  }
  const m = asAudio(music);
  const trim = m.trimStart ?? 0;
  const rate = m.playbackRate ?? 1;
  const beatsTl = beat.beats
    .map((f) => Math.round(m.start + (f - trim) / rate))
    .filter((f) => f >= m.start && f <= m.start + m.duration);
  const cuts = cutFrames(visualTracks);
  const internal = cuts.length > 2 ? cuts.slice(1, -1) : [];
  if (internal.length === 0 || beatsTl.length === 0) {
    return { dimension: "beat_alignment", score: 50, applicable: false, weight: 0.8, findings: [{ dimension: "beat_alignment", severity: "info", message: "No hay cortes internos que evaluar." }] };
  }
  const k = Math.max(2, Math.round(0.08 * fps));
  let onBeat = 0;
  const dists: { frame: number; dist: number }[] = [];
  for (const c of internal) {
    let best = Infinity;
    for (const b of beatsTl) best = Math.min(best, Math.abs(c - b));
    dists.push({ frame: c, dist: best });
    if (best <= k) onBeat++;
  }
  const pct = onBeat / internal.length;
  const findings: CritiqueFinding[] = [];
  if (pct < 0.6) {
    findings.push({ dimension: "beat_alignment", severity: "warn", message: `Solo ${Math.round(pct * 100)}% de cortes alineados al beat (${beat.bpm} BPM).` });
    for (const d of dists.sort((a, b) => b.dist - a.dist).slice(0, 3)) {
      findings.push({
        dimension: "beat_alignment",
        severity: "info",
        frame: d.frame,
        atSec: +(d.frame / fps).toFixed(2),
        message: `Corte a ${Math.round((d.dist / fps) * 1000)}ms del beat`,
        fix: "mueve/parte el corte al frame del beat más cercano",
      });
    }
  }
  return { dimension: "beat_alignment", score: Math.round(clamp(pct * 100)), applicable: true, weight: 0.8, findings };
}

function scoreDeadAir(voice: Clip | null, sil: AudioInputs["sil"], audioTrackCount: number, fps: number): DimensionScore {
  if (!voice) {
    const sev: Severity = audioTrackCount === 0 ? "warn" : "info";
    return { dimension: "dead_air", score: 50, applicable: false, weight: 1.0, findings: [{ dimension: "dead_air", severity: sev, message: audioTrackCount === 0 ? "No hay narración/audio para evaluar dead air." : "No se identificó pista de voz." }] };
  }
  if (!sil) return { dimension: "dead_air", score: 50, applicable: false, weight: 1.0, findings: [{ dimension: "dead_air", severity: "info", message: "No se pudo analizar el silencio de la voz." }] };
  const v = asAudio(voice);
  const trim = v.trimStart ?? 0;
  const rate = v.playbackRate ?? 1;
  const voiceSec = v.duration / fps;
  let totalDead = 0;
  const findings: CritiqueFinding[] = [];
  for (const s of sil.silences) {
    const dur = s.end - s.start;
    totalDead += dur;
    if (dur > 1) {
      const fStart = Math.round(v.start + (s.start * fps - trim) / rate);
      findings.push({
        dimension: "dead_air",
        severity: dur > 2 ? "high" : "warn",
        frame: fStart,
        atSec: +(fStart / fps).toFixed(2),
        message: `Silencio muerto: ${dur.toFixed(1)}s`,
        fix: `auto_cut_silences clipId=${voice.id}`,
      });
    }
  }
  const deadPct = voiceSec > 0 ? totalDead / voiceSec : 0;
  return { dimension: "dead_air", score: Math.round(clamp(100 - deadPct * 150)), applicable: true, weight: 1.0, findings };
}

function scoreEnergyArc(beat: BeatAnalysis | null): DimensionScore {
  const e = beat?.energy;
  if (!e || e.length < 6) return { dimension: "energy_arc", score: 50, applicable: false, weight: 0.6, findings: [{ dimension: "energy_arc", severity: "info", message: "Sin envolvente de energía (sin música)." }] };
  const mean = e.reduce((a, b) => a + b, 0) / e.length;
  const std = Math.sqrt(e.reduce((a, b) => a + (b - mean) * (b - mean), 0) / e.length);
  const cv = std / (mean || 1e-6);
  const max = Math.max(...e);
  let score = clamp(cv * 250);
  const findings: CritiqueFinding[] = [];
  if (max <= 1.3 * mean) {
    score = Math.min(score, 35);
    findings.push({ dimension: "energy_arc", severity: "info", message: "Energía plana, sin picos; considera dinámica (volumen/zoom/cortes) o un drop." });
  }
  return { dimension: "energy_arc", score: Math.round(score), applicable: true, weight: 0.6, findings };
}

function scoreLoudness(loud: Loudness | null, target: number, music: Clip | null, voice: Clip | null): DimensionScore {
  if (!loud || loud.integratedLufs == null) return { dimension: "loudness", score: 50, applicable: false, weight: 1.0, findings: [{ dimension: "loudness", severity: "info", message: "Sin medición de loudness." }] };
  const lufs = loud.integratedLufs;
  const diff = Math.abs(lufs - target);
  const score = diff <= 0.5 ? 100 : diff <= 1 ? 90 : diff <= 2 ? 75 : clamp(100 - diff * 10);
  const findings: CritiqueFinding[] = [];
  const fixId = (music ?? voice)?.id;
  if (diff > 2)
    findings.push({ dimension: "loudness", severity: diff > 4 ? "high" : "warn", message: `Audio en ${lufs} LUFS (objetivo ${target}).`, fix: `normalize_audio clipId=${fixId} targetLufs=${target}` });
  if (loud.truePeakDb != null && loud.truePeakDb > -1)
    findings.push({ dimension: "loudness", severity: "warn", message: `True peak ${loud.truePeakDb} dBFS > −1; riesgo de clipping.`, fix: `normalize_audio clipId=${fixId}` });
  return { dimension: "loudness", score: Math.round(score), applicable: true, weight: 1.0, findings };
}

function scoreHook(visualTracks: Track[], fps: number): DimensionScore {
  const allVisual = visualClips(visualTracks);
  if (allVisual.length === 0)
    return { dimension: "hook", score: 50, applicable: false, weight: 1.0, findings: [{ dimension: "hook", severity: "info", message: "Sin clips visuales." }] };
  const hookF = Math.ceil(fps * 3);
  const inHook = allVisual.filter((c) => c.start < hookF && c.start + c.duration > 0);
  const hasText = inHook.some((c) => c.type === "text" && (!!(c as { text?: string }).text || ((c as { words?: unknown[] }).words?.length ?? 0) > 0));
  const hasAnimation = inHook.some((c) => (c as { animationIn?: { preset?: string } }).animationIn?.preset && (c as { animationIn?: { preset?: string } }).animationIn!.preset !== "none");
  const hasMovement = inHook.some((c) =>
    ((c as { keyframeTracks?: { property: string; keyframes: unknown[] }[] }).keyframeTracks ?? []).some(
      (k) => ["x", "y", "scale", "rotation"].includes(k.property) && k.keyframes.length > 1,
    ),
  );
  const score = hasText && (hasAnimation || hasMovement) ? 100 : hasText ? 60 : hasAnimation || hasMovement ? 45 : 10;
  const findings: CritiqueFinding[] = [];
  if (score < 60)
    findings.push({ dimension: "hook", severity: "warn", frame: 0, atSec: 0, message: "Hook débil en los primeros 3s (sin texto + movimiento).", fix: "add_text/add_subtitles + set_animation preset=pop en frame 0" });
  return { dimension: "hook", score, applicable: true, weight: 1.0, findings };
}

function scoreCaptionCoverage(doc: Project, voice: Clip | null, sil: AudioInputs["sil"], fps: number): DimensionScore {
  if (!voice) return { dimension: "caption_coverage", score: 50, applicable: false, weight: 0.7, findings: [{ dimension: "caption_coverage", severity: "info", message: "Sin voz; no se evalúa cobertura de captions." }] };
  const v = asAudio(voice);
  const trim = v.trimStart ?? 0;
  const rate = v.playbackRate ?? 1;
  // Tiempo hablado = rango de la voz menos los silencios (en frames de timeline).
  let spoken: { start: number; end: number }[] = [{ start: v.start, end: v.start + v.duration }];
  if (sil) {
    for (const s of sil.silences) {
      const fs = Math.round(v.start + (s.start * fps - trim) / rate);
      const fe = Math.round(v.start + (s.end * fps - trim) / rate);
      spoken = spoken.flatMap((seg) => {
        if (fe <= seg.start || fs >= seg.end) return [seg];
        const parts: { start: number; end: number }[] = [];
        if (fs > seg.start) parts.push({ start: seg.start, end: Math.max(seg.start, fs) });
        if (fe < seg.end) parts.push({ start: Math.min(seg.end, fe), end: seg.end });
        return parts;
      });
    }
  }
  spoken = spoken.filter((s) => s.end > s.start);
  const spokenTotal = spoken.reduce((a, s) => a + (s.end - s.start), 0);
  if (spokenTotal <= 0) return { dimension: "caption_coverage", score: 50, applicable: false, weight: 0.7, findings: [{ dimension: "caption_coverage", severity: "info", message: "No hay tiempo hablado medible." }] };
  const textRanges = mergeRanges(
    doc.tracks.flatMap((t) => t.clips).filter((c) => c.type === "text").map((c) => ({ start: c.start, end: c.start + c.duration })),
  );
  let covered = 0;
  for (const seg of spoken) for (const tr of textRanges) covered += overlap(seg, tr);
  const pct = covered / spokenTotal;
  const findings: CritiqueFinding[] = [];
  if (pct < 0.7) {
    findings.push({ dimension: "caption_coverage", severity: "warn", message: `Solo ${Math.round(pct * 100)}% del habla tiene texto en pantalla (legibilidad en mute).`, fix: `add_subtitles/auto_caption clipId=${voice.id}` });
    for (const seg of spoken.slice(0, 3)) {
      const segCovered = textRanges.reduce((a, tr) => a + overlap(seg, tr), 0);
      if (segCovered / (seg.end - seg.start) < 0.5)
        findings.push({ dimension: "caption_coverage", severity: "info", frame: seg.start, atSec: +(seg.start / fps).toFixed(2), message: `Sin caption: ~${((seg.end - seg.start) / fps).toFixed(1)}s` });
    }
  }
  return { dimension: "caption_coverage", score: Math.round(clamp(pct * 100)), applicable: true, weight: 0.7, findings };
}

export function buildScorecard(doc: Project, audio: AudioInputs, opts: CritiqueOpts = {}): Scorecard {
  const fps = Math.max(1, doc.fps);
  const durF = Math.max(1, doc.durationInFrames);
  const targetLufs = opts.targetLufs ?? -14;
  const visualTracks = doc.tracks.filter((t) => t.kind === "media");
  const audioTracks = doc.tracks.filter((t) => t.kind === "audio");

  const dimensions: DimensionScore[] = [
    scoreCadence(visualTracks, fps),
    scoreBeatAlignment(visualTracks, audio.beat, audio.musicClip, fps),
    scoreDeadAir(audio.voiceClip, audio.sil, audioTracks.length, fps),
    scoreEnergyArc(audio.beat),
    scoreLoudness(audio.loud, targetLufs, audio.musicClip, audio.voiceClip),
    scoreHook(visualTracks, fps),
    scoreCaptionCoverage(doc, audio.voiceClip, audio.sil, fps),
  ];

  const applicable = dimensions.filter((d) => d.applicable);
  const overall = applicable.length
    ? Math.round(applicable.reduce((a, d) => a + d.score * d.weight, 0) / applicable.reduce((a, d) => a + d.weight, 0))
    : 50;

  return {
    overall,
    dimensions,
    meta: {
      durationSec: +(durF / fps).toFixed(2),
      fps,
      musicClipId: audio.musicClip?.id ?? null,
      voiceClipId: audio.voiceClip?.id ?? null,
      bpm: audio.beat?.bpm ?? null,
      targetLufs,
      degraded: audio.degraded,
    },
  };
}
