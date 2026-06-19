---
name: sound-audio
description: "Practical craft procedure for audio in video/content and music production basics — recording, dialogue/voice cleanup, mixing, loudness, music and sound design. Use when recording or cleaning dialogue or voice, mixing audio for video or a track, hitting platform loudness (LUFS) targets, choosing or placing a mic, doing music and sound design or sync, or fixing noise/levels/clipping. Capture quality is decided at the source, not in post; deliver to the platform's loudness spec, not by ear. The personal layer (the user's actual gear, room, deliverable specs, and prior projects, via recall) overrides generic best practice."
---

# Sound & Audio

A binary craft procedure for recording, repairing, mixing, and delivering audio.
Generic best practice is the floor. **Whenever `personal/` recall returns the
user's real setup — their mic and interface, their room, the client/platform
deliverable spec, prior project settings — that OVERRIDES the generic moves
below.** Surface the conflict, then follow personal/.

## 0. First principle: capture is everything

You cannot fix in post what you failed to capture. Reflections, clipping,
background HVAC, and proximity mush are far cheaper to prevent than to repair.
Spend the effort at the source. Repair tools subtract quality; good capture costs
nothing later.

## 1. Capture (record it right)

- **Mic type/pattern to the job.** Cardioid (or hypercardioid) dynamic for
  untreated rooms and loud sources — it rejects the room. Large-diaphragm
  condenser for detail in a treated space. Shotgun/lav for on-camera dialogue.
  Match the polar pattern to what you want to reject, not just capture.
- **Distance & proximity.** Close = more direct sound, less room, more bass
  buildup (proximity effect on directional mics). For voice, ~15-20 cm off-axis
  with a pop filter is a safe start. Closer beats farther in a bad room.
- **Gain staging.** Set levels so peaks land around -12 to -6 dBFS, average
  dialogue near -18 dBFS. Leave headroom. **Digital clipping (0 dBFS) is
  unrecoverable** — when in doubt, record quieter. Record 24-bit so low levels
  still have resolution.
- **Treat the room / kill reflections.** Soft surfaces, blankets, a closet, or
  panels behind and around the source. A dead room beats an echoey "nice" one.
  Move away from walls and hard parallel surfaces.
- **Monitor on headphones while recording.** Catch noise, clipping, plosives,
  and handling rumble live — not in the edit when it's too late.

## 2. Repair & cleanup (only what capture couldn't prevent)

Fix at the source first; reach for plugins second. Order:
1. **Subtractive clean** — broadband/spectral denoise (light hand; over-denoise
   sounds underwater), de-hum (50/60 Hz), de-click, de-plosive, breaths.
2. **High-pass filter** voice ~80-100 Hz to remove rumble it doesn't need.

## 3. Signal chain order (do not reorder)

Clean → **EQ (subtractive first)** → **compression** → **de-ess** → limiter.

- **EQ subtractive-first:** cut problem resonances (boxy ~200-400 Hz, harsh
  ~2-5 kHz) before boosting anything. Boosting everything just raises noise and
  the floor. Narrow cuts, wide gentle boosts.
- **Compression:** control dynamics for consistency, not loudness. Moderate
  ratio (~2:1-4:1), a few dB of gain reduction. Listen for pumping/breathing.
- **De-ess** sibilance after compression (compression often worsens it).
- **Limiter** last, to catch peaks — not as the loudness tool.

## 4. Dialogue intelligibility is the priority

For any video/content mix, **the words come first.** Everything else (music,
SFX, ambience) supports them. If you can't hear the words on phone speakers, the
mix has failed regardless of how it sounds on monitors.

## 5. Loudness: deliver to the spec, stop mastering by ear

Mix to a target with a meter, not vibes. Integrated LUFS targets (true-peak
ceiling -1 dBTP, or -1.5 for safety after lossy transcode):

- **Music streaming** (Spotify, YouTube, Tidal, Amazon): ~ **-14 LUFS**.
- **Apple Music:** ~ -16 LUFS. **Deezer:** ~ -15.
- **Podcast / spoken word:** ~ **-16 LUFS** stereo (-19 mono); AES window -16 to -20.
- **Broadcast TV:** **-23 LUFS** (EBU R128) / -24 LKFS (ATSC A/85), tight tolerance.

Platforms normalize loudness; pushing hotter than target just gets turned down
and loses dynamics. Match the spec, keep peaks under the ceiling.

## 6. Music & sound design support, never overpower

- Music and SFX serve the picture/voice. **Duck music under dialogue**
  (sidechain or manual rides, typically several dB) so words stay clear.
- Use SFX/ambience for continuity and realism; design intentionally, not as
  clutter.

## 7. Sync & continuity

Lock audio to picture (clap/slate or waveform align). Watch for drift on long
takes (sample-rate/frame-rate mismatch). Keep room tone to patch edits and bridge
cuts so ambience doesn't jump.

## 8. Reference on multiple systems

Check the mix on at least: monitors/headphones, a phone speaker, and earbuds.
A/B against a known commercial reference at matched loudness. If it holds up on a
phone, it holds up.

## Honesty boundary

Disclose AI-generated or voice-cloned audio; do not pass synthetic voice off as a
real person without consent. Respect music and sample licensing — no unlicensed
copyrighted music in deliverables.
