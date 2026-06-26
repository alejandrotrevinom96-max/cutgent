import "server-only";
import { analyzeBeats } from "./beats";
import { detectSilences } from "./silences";
import { measureLoudness } from "./audio-tools";
import { buildScorecard, selectMusicClip, selectVoiceClip, type Scorecard, type CritiqueOpts } from "./critique-score";
import type { Project, Clip } from "./schema";

/**
 * Crítico editorial: corre el análisis de audio (beats/silencios/loudness) sobre
 * las pistas del doc y delega el scoring puro a critique-score. Cada análisis va
 * en try/catch → degrada (no crashea) si una pista no tiene audio o ffmpeg falla.
 */

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const srcOf = (c: Clip | null): string | null => (c ? ((c as unknown as { src?: string }).src ?? null) : null);

export async function critiqueProject(doc: Project, opts: CritiqueOpts = {}): Promise<Scorecard> {
  const fps = Math.max(1, doc.fps);
  const audioTracks = doc.tracks.filter((t) => t.kind === "audio");
  const musicClip = selectMusicClip(audioTracks, opts.musicClipId);
  const voiceClip = selectVoiceClip(audioTracks, opts.voiceClipId, musicClip);
  const degraded: string[] = [];
  if (opts.musicClipId && musicClip?.id !== opts.musicClipId)
    degraded.push(`override música '${opts.musicClipId}' no encontrado → heurística`);
  if (opts.voiceClipId && voiceClip?.id !== opts.voiceClipId)
    degraded.push(`override voz '${opts.voiceClipId}' no encontrado → heurística`);

  let beat: Awaited<ReturnType<typeof analyzeBeats>> | null = null;
  let sil: Awaited<ReturnType<typeof detectSilences>> | null = null;
  let loud: Awaited<ReturnType<typeof measureLoudness>> | null = null;

  const musicSrc = srcOf(musicClip);
  const voiceSrc = srcOf(voiceClip);
  if (musicSrc) {
    try {
      beat = await analyzeBeats(musicSrc, { fps });
    } catch (e) {
      degraded.push(`beats: ${msg(e)}`);
    }
  }
  if (voiceSrc) {
    try {
      sil = await detectSilences(voiceSrc);
    } catch (e) {
      degraded.push(`silences: ${msg(e)}`);
    }
  }
  const loudSrc = musicSrc ?? voiceSrc;
  if (loudSrc) {
    try {
      loud = await measureLoudness(loudSrc);
    } catch (e) {
      degraded.push(`loudness: ${msg(e)}`);
    }
  }

  return buildScorecard(doc, { beat, sil, loud, musicClip, voiceClip, degraded }, opts);
}
