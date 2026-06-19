// TTS provider (renderer). Default: the browser SpeechSynthesis engine + an
// estimated phoneme track so the avatar lip-syncs (the FFT/amplitude-fallback tier
// from the ADR — no cloud, no key). Swap in Kokoro/ElevenLabs behind this same
// interface; the avatar only ever consumes VisemeEvents, so nothing downstream
// changes (ADR D6, viseme contract).
// @ts-ignore — shared pure ESM
import { buildLipsync } from "../../shared/avatar/lipsyncTimeline.mjs";

export interface VisemeEvent {
  turnId: string;
  target: { kind: "viseme"; id: string };
  startMs: number;
  durMs: number;
  weight: number;
}

export interface TtsProvider {
  speak(text: string, turnId: string, onVisemes: (e: VisemeEvent[]) => void): Promise<void>;
  stop(): void;
}

// Estimate a phoneme track from text so the mouth moves with rough timing.
// Vowel-per-syllable heuristic; honest "coarse" lip-sync, upgradeable to forced
// alignment later without touching the avatar.
function estimatePhonemes(text: string, turnId: string) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const vowels = ["AA", "EH", "IH", "OW", "UW", "IY"];
  const perVowelMs = 130;
  let t = 0;
  const phonemes: { phoneme: string; startMs: number; durMs: number }[] = [];
  for (const w of words) {
    const syll = Math.max(1, (w.match(/[aeiouy]+/g) || [""]).length);
    for (let i = 0; i < syll; i++) {
      phonemes.push({ phoneme: vowels[(w.charCodeAt(i) || 0) % vowels.length], startMs: t, durMs: perVowelMs });
      t += perVowelMs;
    }
    phonemes.push({ phoneme: "sil", startMs: t, durMs: 60 });
    t += 60;
  }
  return { turnId, phonemes };
}

export class BrowserTts implements TtsProvider {
  private current: SpeechSynthesisUtterance | null = null;

  async speak(text: string, turnId: string, onVisemes: (e: VisemeEvent[]) => void): Promise<void> {
    onVisemes(buildLipsync(estimatePhonemes(text, turnId)) as VisemeEvent[]);
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      this.current = u;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  stop(): void {
    // Barge-in: stop output FIRST (ADR D8).
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    this.current = null;
  }
}
