# Recipe: audio cleanup (denoise + normalize + duck)

Order matters. Run on the VOICE clip unless noted.

1. **Diagnose.** `measure_loudness {clipId}` → integrated LUFS, true peak, LRA,
   and diff vs −14 LUFS.
2. **Clean the voice.** `clean_audio {clipId, denoise:true, highpass:80,
   deEss:true}` — afftdn + anti-rumble highpass + de-esser. Replaces `src`.
3. **Normalize.** `normalize_audio {clipId}` → ≈ −14 LUFS (optional `i`,`tp`,`lra`
   for another target). Replaces `src`. Do this AFTER denoise (normalizing first
   pushes noise up to the target).
4. **Fades.** `set_audio_fades {clipId, fadeInFrames:15, fadeOutFrames:30}` to
   avoid hard cuts.
5. **Duck music under voice.** `auto_duck {musicClipId, voiceClipId, level:0.2,
   rampFrames:8}` — detects speech windows and lowers the MUSIC there. Target =
   the MUSIC clip, not the voice. Manual by range: `duck_audio {clipId, fromFrame,
   toFrame, level}`.

## Loudness targets
−14 LUFS (YouTube, default). Alternatives if asked: TikTok/IG ≈ −14, podcast
≈ −16, broadcast −23. Pass via `normalize_audio {i:<target>}`.

## Common mistakes
- Reverse order (normalize before denoise raises the noise floor).
- `clean_audio` on music (it's for voice).
- `auto_duck`/`duck_audio` expect the MUSIC `clipId` as the target, not the voice.
- `clean_audio`/`normalize_audio` create a new asset each call — verify with
  `measure_loudness`, don't chain blindly.
