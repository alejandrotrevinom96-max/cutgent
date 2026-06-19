---
name: editing-video-with-cutgent
description: >-
  Edits video end-to-end in Cutgent (a desktop video editor driven through the
  cutgent MCP server): assembles timelines, cuts silences, adds captions/subtitles,
  color grades, cleans and normalizes audio, makes vertical shorts, generates AI
  b-roll, and exports/renders. Use whenever the user wants to edit, cut, trim,
  caption/subtitle, color grade, clean or normalize audio, make a short or
  vertical clip, add b-roll, or export/render — or mentions "my YouTube video",
  "this footage", "the editor", or Cutgent — even if they never name a tool.
  Also in Spanish: "edita este video", "córtale los silencios", "ponle
  subtítulos", "haz un short vertical", "corrige el color", "limpia el audio",
  "expórtalo a Premiere", "renderiza".
when_to_use: >-
  "edit this video", "cut the silences", "add subtitles/captions", "make a
  vertical short/reel", "color grade this", "clean up the audio", "normalize
  loudness", "add b-roll", "export to Premiere/Resolve", "render the final
  video"; y sus equivalentes en español ("edita/corta/subtítulos/short/color/
  audio/exporta/renderiza").
allowed-tools: mcp__cutgent__list_projects mcp__cutgent__get_project mcp__cutgent__list_tracks mcp__cutgent__list_assets mcp__cutgent__find_clips mcp__cutgent__get_transcript mcp__cutgent__get_snap_points mcp__cutgent__measure_loudness
---

# Editing video with Cutgent

Drive the Cutgent desktop editor through its MCP server so the user edits in
natural language without naming tools. Assume the `cutgent` MCP is connected; its
tools are `mcp__cutgent__<tool>`. Refer to tools by intent first, then the exact
id. Full catalogue in `references/tools-map.md`.

> If the MCP is bundled as a Claude Code plugin, tool ids become
> `mcp__<plugin>_cutgent__<tool>` — only `references/tools-map.md` hardcodes ids,
> so update them there in one place.

## 0. Preflight (always, before any edit)
- Confirm the MCP is reachable: `mcp__cutgent__list_projects`. If it errors, tell
  the user Cutgent isn't connected (open the app / add the MCP) and stop.
- Open or create the project: `mcp__cutgent__open_project` /
  `mcp__cutgent__create_project` / `mcp__cutgent__new_project`.
- Inspect state before editing: `mcp__cutgent__get_project` (read `fps`, `width`,
  `height`, `durationInFrames`, real `trackId`/`clipId`), then `list_tracks`,
  `list_assets`.

## CRITICAL conventions (read every time)
- **TIME IS IN FRAMES, not seconds**, for almost all tools (`start`, `duration`,
  `frame`, `fromFrame`, keyframes, `move_clip`, `split_clip`, `add_marker`).
  `frames = round(seconds × project.fps)`. ALWAYS `get_project` first to know
  `fps`. EXCEPTIONS that take SECONDS: `add_subtitles.cues` {start,end},
  `create_clip_from_source` (startSec/endSec), silence thresholds in seconds —
  `detect_silences` (minDurSec) and `auto_cut_silences` (minSilenceSec) — and
  transcript ranges. Note: `auto_cut_silences.paddingMs` is MILLISECONDS and
  `noiseDb` is decibels (not seconds).
- **IDs come back IN THE RESPONSE TEXT** (`clipId=clip_xxxx`, `trackId=...`,
  `jobId=...`), not as JSON — parse them from the string. After `split_clip`,
  `auto_cut_silences`, `ripple_delete` (ids shift), re-query `get_project` /
  `find_clips` before continuing.
- **Tracks:** `tracks[0]` is the bottom layer; the last track draws on top. Clip
  `x`/`y` are pixels from the CENTER (0,0 = centered), not the corner.
- **ASYNC = polling:** `render_video`→`render_status`,
  `generate_media`→`generate_status`. `transcribe_source` / `auto_caption` poll
  internally but may return "in process" → retry with `get_transcript`.
- **Uncertain language:** if transcribe/caption returns needs_language, DO NOT
  guess — ask the user and re-call with `language` ("es","en","pt"). Optional
  pre-check: `detect_language`.
- **Local ffmpeg ops REPLACE the clip `src` in place** (`clean_audio`,
  `normalize_audio`, `denoise_video`, `sharpen_video`, `stabilize_video`,
  `apply_lut`, `chroma_key`): slow re-encode; `undo` reverts the document but not
  the generated asset. Desktop (Electron) only.
- **Never pass raw disk paths** to `add_video`/`add_image` — run
  `ingest_local_file` first to get a servable `src`.

## Mental model (pipeline)
project → ingest assets → assemble timeline → cut/trim → A/V cleanup →
captions → color → review → export/render.

## Choose the flow (open the matching reference)
- Long-form edit (north-star, ~10-min YouTube): `references/youtube-10min.md`
- Vertical short / reel (9:16): `references/shorts-vertical.md`
- Captions / subtitles: `references/captions.md`
- Color (grade / LUT / look / chroma): `references/color.md`
- Audio (clean / normalize / duck / loudness): `references/audio.md`
- AI b-roll / stock: `references/generate-broll.md`

## Recipes at a glance (details in references)
1. **YouTube 10-min:** `new_project` (or `set_resolution_preset
   {preset:"youtube-1080p"}`) → `ingest_local_file {path}` (returns servable src)
   → `add_video {trackId,src,start:0,duration}` → `transcribe_source {src}` →
   `auto_cut_silences {clipId, minSilenceSec, paddingMs}` (do this BEFORE adding
   music/overlays — it ripples only its own track) → `auto_caption
   {clipId, preset:"youtube"}` → `apply_look`/`set_color_grade` → `clean_audio`
   → `normalize_audio` (≈ −14 LUFS) → music track + `auto_duck` → `render_video`
   → poll `render_status`.
2. **Vertical short:** `transcribe_source {src}` (caches transcript) → pick
   start/endSec from the transcript → `create_clip_from_source {sourceSrc,
   startSec, endSec, vertical:true, withCaptions:true, fps:30}` → `open_project
   {id}` → reframe manually (`update_clip {clipId, patch:{scale,x,y}}` /
   `set_crop`) → `render_video`.
3. **Captions:** `auto_caption {clipId, preset}` OR `add_subtitles {srt}` /
   {cues in SECONDS} → restyle via `find_clips {type:"text"}` + `update_clip` →
   `export_captions {trackName:"Subtítulos", format:"srt"}`.
4. **Color:** `apply_look {clipId, look}` (fast) | `set_color_grade {clipId, …
   −100..100}` (non-destructive) | `apply_lut {clipId, lutPath}` (ffmpeg,
   destructive). Apply to the VIDEO clip, not the track.
5. **Audio:** `measure_loudness` → `clean_audio {denoise:true, highpass:80,
   deEss:true}` → `normalize_audio` → `set_audio_fades` → `auto_duck
   {musicClipId, voiceClipId}`.
6. **Export:** `render_video {format:"h264", quality:"high", gpu:true}` → poll
   `render_status` → read url. Handoff: `export_nle {format:"fcp7"}` (loses
   color/effects/shapes — communicate this). Poster: `export_poster`.
7. **AI b-roll (BYO key, COSTS the user):** confirm first → `generate_media
   {provider, kind, prompt}` → poll `generate_status` → `add_generated_media
   {name, kind, src, trackId, start, duration}`. No-AI: `search_stock`→`import_stock`.

## Safety
- Destructive/expensive (`render_video`, `delete_project`, mass `ripple_delete`,
  any `generate_media` that bills the user): confirm before running; use
  `undo`/`redo` as a net.
- Batch edits: plan → validate (`find_clips`, `get_snap_points`) → execute.

## Output / handoff
After each milestone, summarize what changed and the next suggested step. On
export, report the output path/format and any `export_nle` warnings.

## Known gaps (don't invent tools — use the workaround)
- No range render (in/out): `render_video` exports the whole doc → use
  `create_clip_from_source` or adjust the project's `durationInFrames`.
- `auto_cut_silences` ripples only its own track → cut silences BEFORE adding
  music/overlays.
- No auto-reframe/subject tracking for vertical → reframe manually.
- No detach-audio / per-clip solo/mute → `update_track {trackId, patch:{muted:true}}`
  or `update_clip {clipId, patch:{volume:0}}`.
- `export_nle` has no color/effect/transform round-trip → re-apply the look in
  the destination NLE.
