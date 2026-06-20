# Voice — direction & how it reacts

The avatar's voice should match her look (anime soft-goth: warm, sophisticated,
gently mysterious — not childish-breathy, not robotic). And it already **reacts**:
the affect engine emits a prosody hint and the TTS applies it, so she sounds
different by topic and moment.

## Chosen voice — **Luna** (locked)

Picked by ear from a Higgsfield audition (Vesper vs Luna, calm + playful lines).
Recorded in `src/shared/voice/profile.mjs` and gated in `tools/selftest.mjs`.

| field | value |
|-------|-------|
| name | **Luna** |
| engine | Higgsfield TTS (ElevenLabs under the hood) |
| model | `text2speech_v2_elevenlabs` |
| voice_id | `375a3398-e3b4-4f91-845d-42181e352899` (preset) |

**Runtime wiring (next step):** synthesize through the **main process** (ADR D3 — the
key never reaches the renderer) by calling Higgsfield TTS with `VOICE.voiceId`, then
hand the audio + an estimated phoneme track to the avatar. `pickTts()` already
selects "cloud" when a TTS key is configured and falls back to the browser engine
(zero-key, $0, still affect-driven) otherwise. Drop the cloud provider behind the
existing `TtsProvider` interface and nothing downstream changes.

## Target voice character

- **Timbre:** mid / mid-low, warm and smooth, a touch sultry. Youthful-adult, not a
  high "moe" squeak.
- **Default delivery:** calm, articulate, unhurried — sophisticated companion.
- **Range it must support (the affect engine drives this live):**
  - *serious / focused* (philosophy, business) → steadier, slightly slower, even.
  - *playful* (something funny) → brighter, a little faster and higher, smiling tone.
  - *warm / concerned* (counsel, you're stressed) → softer, gentler, slower.
- **Avoid:** flat monotone, harsh/aggressive, exaggerated anime-childish.

## How the reactivity works (already wired)

- `src/shared/affect/affect.mjs` → `speechProsody(affect)` returns `{ rate, pitch,
  energy }`, clamped to safe ranges. Gated in `tools/selftest.mjs` (playful is
  faster + brighter than a serious baseline; values stay in range).
- `src/renderer/providers/tts.ts` → `BrowserTts.speak(..., prosody)` applies
  `rate` / `pitch` / `volume`. Swap in a better engine behind the same interface and
  it keeps reacting — nothing downstream changes (the avatar only consumes visemes).
- `App.tsx` passes the current affect's prosody on every spoken turn.

## Engines (pick one; all sit behind `TtsProvider`)

1. **Browser SpeechSynthesis** — default, $0, offline, no key. Decent for testing;
   prosody (rate/pitch) already applied. Voice quality depends on the OS voices.
2. **ElevenLabs** — best quality + emotion. Pick a warm, calm, youthful-adult female
   voice; map the affect `energy`/`rate`/`pitch` to its style/stability settings.
3. **Kokoro / local TTS** — good quality, runs locally (keeps the $0/offline spirit).

Implement by adding a class that implements `TtsProvider.speak(text, turnId,
onVisemes, prosody)` and selecting it in `providers/index.ts` (`pickTts`).

## Auditioning voices fast (Higgsfield)

Higgsfield has TTS models (`text2speech_v2_elevenlabs`, `_minimax`, `inworld_text_to_speech`,
…). Generate the same line in a few voices and pick the one that fits her — e.g.:

> "Let's think this through together. I'm right here."

Say a line that's calm + warm to judge the default register, and a playful one to
judge range. Once you choose a provider voice, wire it behind `TtsProvider`.

## A first line to test the whole loop

After dropping `public/avatar.vrm`, ask her something **funny** then something
**serious** and watch face + voice shift — that's the affect engine end to end.
