# Sound & Audio Anti-Patterns (detectable failure modes + fix)

## 1. Clipping / gain too hot
**Tell:** peaks slam 0 dBFS; waveform is flat-topped/square; crackle or harsh
distortion on loud words or transients. Recorded "to make it loud."
**Fix:** digital clipping is unrecoverable — re-set gain so peaks land ~-12 to
-6 dBFS with headroom, record 24-bit, and when unsure record quieter. Use loudness
processing at the end, not input gain, to get level.

## 2. Fix-it-in-post mindset
**Tell:** "we'll clean it up later" said about room echo, HVAC, plosives, or a
bad mic position during the take.
**Fix:** stop and solve it at the source — move the mic, kill the noise, treat the
room, add a pop filter. Repair tools subtract quality; capture is the cheapest fix.

## 3. Over-compression / pumping
**Tell:** the track breathes or pumps with the beat; quiet parts surge up between
words; everything is the same flat level and fatiguing.
**Fix:** compress for consistency, not loudness — moderate ratio, a few dB of gain
reduction, attack/release set so it's transparent. Use multiple gentle stages
instead of one crushing one.

## 4. Ignoring LUFS / mastering by ear
**Tell:** no loudness meter open; "it sounds loud enough"; the track is jarringly
louder or quieter than reference material on the same platform.
**Fix:** meter integrated LUFS to the platform target (~-14 streaming, -16
podcast/Apple, -23 broadcast) with true peak under -1 dBTP. Platforms normalize —
match the spec instead of fighting it.

## 5. Music/SFX burying dialogue
**Tell:** you strain to catch words; testers ask "what did they say?"; music and
voice occupy the same level and frequency space.
**Fix:** make voice the priority — carve an EQ pocket, duck music several dB under
dialogue (sidechain or manual rides), and verify intelligibility on a phone speaker.

## 6. Noisy / reflective room
**Tell:** audible hum, hiss, traffic, or AC under the recording; boxy echo or
"recorded in a bathroom" ring; the voice sounds distant.
**Fix:** record in the deadest available space (soft furnishings, blankets, a
closet, panels), move off hard parallel walls, get the mic closer, and turn off
noise sources before rolling.

## 7. EQ-boost-everything
**Tell:** every band on the EQ is boosted; "add some highs, add some lows, add
presence" until the noise floor and harshness come up with it.
**Fix:** subtractive-first — cut the problem frequencies (boxy ~200-400 Hz, harsh
~2-5 kHz) before any boost. Narrow surgical cuts, wide gentle boosts only if needed.

## 8. Over-denoise / artifact soup
**Tell:** the voice sounds underwater, swirly, or robotic; reverb tails turn into
metallic warble after noise reduction.
**Fix:** denoise with a light hand in stages; a slightly noisy but natural voice
beats an artifact-laden one. Best fix is still capturing less noise to begin with.
