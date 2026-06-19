# Sources

## Canonical (core craft)
- Bobby Owsinski — *The Mixing Engineer's Handbook* & *The Recording Engineer's
  Handbook*. Mic technique, signal chain, mixing fundamentals.
- Mike Senior — *Mixing Secrets for the Small Studio*. Practical mixing and
  referencing in untreated/home rooms; the multi-system reference method.
- David Sonnenschein — *Sound Design: The Expressive Power of Music, Voice and
  Sound Effects in Cinema*. Sound design for picture.
- Ric Viers — *The Sound Effects Bible* / *The Location Sound Bible*. Field
  recording, dialogue capture, mic choice and placement.
- F. Alton Everest — *Master Handbook of Acoustics*. Room treatment, reflections,
  acoustics first principles.
- Ben Burtt (interviews/commentaries) and Walter Murch — *In the Blink of an Eye*
  / Randy Thom essays. Cinematic sound design and the dialogue-first philosophy.

## Standards & loudness (verify before delivery)
- **ITU-R BS.1770** — the loudness measurement algorithm (LKFS/LUFS, true-peak).
  The basis everything below uses.
- **EBU R128** — broadcast integrated loudness -23 LUFS (Europe); **ATSC A/85**
  -24 LKFS (US broadcast).
- **AES TD1004** — recommendation for loudness of audio streaming / network file
  playback (~-16 to -20 LUFS window, -1 dBTP).
- Platform normalization specs: Spotify/YouTube/Tidal/Amazon ~ -14 LUFS, Apple
  Music ~ -16, Deezer ~ -15; podcasts ~ -16 (stereo) / -19 (mono).

## Note on freshness
Platform LUFS targets and normalization behavior change and differ by service —
they are point-in-time (verified mid-2025/2026) and must be re-checked against the
current platform spec before final delivery. Gear, plugin, and DAW specifics are
externally ingested via recall and treated as point-in-time. The `personal/` layer
(the user's own gear, room, measured settings, and client/deliverable specs)
supersedes everything here when present.
