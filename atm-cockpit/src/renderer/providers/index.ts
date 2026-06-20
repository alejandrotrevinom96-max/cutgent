// Provider factory — the single swap point for speech I/O. Defaults are the
// zero-install browser engines; replace the bodies with local Whisper/Kokoro (or
// cloud Deepgram/ElevenLabs) behind the SAME interfaces and nothing downstream
// changes (ADR D6: the avatar only ever consumes VisemeEvents).
import { BrowserStt, type SttProvider } from "./stt";
import { BrowserTts, type TtsProvider } from "./tts";
// @ts-ignore shared pure ESM
import { VOICE, pickTtsKind } from "../../shared/voice/profile.mjs";

export type { SttProvider, SttEvent } from "./stt";
export type { TtsProvider, VisemeEvent } from "./tts";

export function pickStt(): SttProvider {
  // SWAP HERE for local faster-whisper/whisper.cpp via the main process over IPC.
  return new BrowserStt();
}

export function pickTts(): TtsProvider {
  // Chosen voice: VOICE (Luna, Higgsfield/ElevenLabs preset) — see docs/VOICE.md.
  // When a TTS key is configured, synthesis should run through the main process
  // (ADR D3: key never in renderer) using VOICE.voiceId, behind this same
  // TtsProvider interface. Until that cloud provider is wired, the browser engine
  // is the working default — still affect-driven (rate/pitch/energy) and $0/offline.
  const kind = pickTtsKind((import.meta as any).env ?? {});
  if (kind === "cloud") {
    // TODO: return new CloudTts(VOICE) backed by an IPC call to main -> Higgsfield TTS.
    return new BrowserTts();
  }
  return new BrowserTts();
}
