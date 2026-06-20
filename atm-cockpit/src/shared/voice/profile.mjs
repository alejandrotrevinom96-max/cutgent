// The avatar's chosen voice — picked by ear from a Higgsfield audition
// (Luna, ElevenLabs preset). Pure config + a tiny selection rule so it's testable.
//
// The avatar talks through TtsProvider (providers/tts.ts); the affect engine feeds
// it live prosody (speechProsody). This file only records WHICH voice and WHEN to
// use the cloud engine vs the zero-key browser default.

export const VOICE = {
  name: "Luna",
  // The voice lives as a Higgsfield preset (ElevenLabs under the hood). Runtime
  // synthesis calls Higgsfield TTS (generate_audio) with this id, from the main
  // process so the key never reaches the renderer (ADR D3).
  engine: "higgsfield",
  model: "text2speech_v2_elevenlabs",
  voiceId: "375a3398-e3b4-4f91-845d-42181e352899",
  voiceType: "preset",
  notes: "warm, sophisticated, soft-goth companion; mid-low timbre. Range confirmed " +
    "across calm and playful lines. Affect engine drives live rate/pitch/energy.",
};

/**
 * Which TTS engine to use. Cloud (Luna via Higgsfield/ElevenLabs) when a key is
 * configured; otherwise the zero-key browser engine (still $0/offline, still
 * affect-driven prosody). Pure & testable.
 * @param {Record<string,string|undefined>} env
 * @returns {"cloud"|"browser"}
 */
export function pickTtsKind(env = {}) {
  const hasKey = !!(env.HIGGSFIELD_API_KEY || env.ELEVENLABS_API_KEY || env.VITE_HIGGSFIELD_API_KEY);
  return hasKey ? "cloud" : "browser";
}
