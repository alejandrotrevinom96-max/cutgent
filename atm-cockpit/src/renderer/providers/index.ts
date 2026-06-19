// Provider factory — the single swap point for speech I/O. Defaults are the
// zero-install browser engines; replace the bodies with local Whisper/Kokoro (or
// cloud Deepgram/ElevenLabs) behind the SAME interfaces and nothing downstream
// changes (ADR D6: the avatar only ever consumes VisemeEvents).
import { BrowserStt, type SttProvider } from "./stt";
import { BrowserTts, type TtsProvider } from "./tts";

export type { SttProvider, SttEvent } from "./stt";
export type { TtsProvider, VisemeEvent } from "./tts";

export function pickStt(): SttProvider {
  // SWAP HERE for local faster-whisper/whisper.cpp via the main process over IPC.
  return new BrowserStt();
}

export function pickTts(): TtsProvider {
  // SWAP HERE for local Kokoro/Piper (offline) or ElevenLabs (expressive, cloud).
  return new BrowserTts();
}
