# Recipe: captions & subtitles

## Auto (from audio)
`auto_caption {clipId, preset, language?}` — transcribes the clip and builds the
"Subtítulos" track aligned to it (respects trimStart/duration). Presets:
- `youtube` — 64px, stroke, lower third (y≈380)
- `tiktok` — 96px bold, centered (y≈0)
- `minimal` — clean, no stroke
- `bold` — large yellow with heavy stroke

If it returns needs_language, ask the user and re-call with `language`
("es","en","pt").

## From existing text
`add_subtitles {srt}` (SRT or WebVTT, tolerant parser) **or**
`add_subtitles {cues:[{start,end,text}]}` — cues are in **SECONDS**, plus optional
`preset`, `y`, `trackId`.

## Restyle
Presets are NOT retroactive. To change already-created captions:
`find_clips {trackId, type:"text"}` → `update_clip {clipId, patch:{fontSize,color,y}}`
per clip, or re-run `add_subtitles` with another preset on a new track.

## Export (for YouTube/SEO)
`export_captions {trackName:"Subtítulos", format:"srt"}` (or `"vtt"`). If the
track was renamed, pass `trackId` instead of `trackName`.

## Common mistakes
- Passing `cues` in frames (they're seconds).
- Expecting a preset to restyle existing captions (recreate or edit per clip).
- `auto_caption` respects `trimStart`; raw-SRT `add_subtitles` does NOT compensate
  for trimStart (it aligns from project 0).
