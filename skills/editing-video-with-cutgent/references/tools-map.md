# Cutgent MCP — tool map (intent → tool id)

The ONLY place full tool ids are hardcoded. All ids are `mcp__cutgent__<tool>`
(or `mcp__<plugin>_cutgent__<tool>` if bundled as a Claude Code plugin — update
here only). Time is in FRAMES unless noted (see SKILL.md conventions).

## Projects & state (read-only first)
- list projects → `list_projects` · open → `open_project {id}`
- new editor project (3 tracks, OPENS it) → `new_project {name,width,height,fps}`
- empty project metadata (NOT opened; for batch/viral clips) → `create_project {name,kind,sourceId}`
- read everything (fps, dims, tracks, clips) → `get_project`
- delete → `delete_project` (destructive: confirm)
- project settings → `set_project_settings {patch}` · resolution preset →
  `set_resolution_preset {preset}` (presets: `youtube-1080p`, `youtube-1080p60`,
  `youtube-4k`, `shorts`, `square`)

## Media in
- ingest a LOCAL file to a servable src → `ingest_local_file {path}` (REQUIRED
  before add_video/add_image with a disk path)
- import asset (url/known src) → `import_asset` · list assets → `list_assets`
- stock search → `search_stock {query,type}` · import a stock result →
  `import_stock {url,kind,name,trackId,start,duration}`
- AI generation (BYO key, costs the user) → `generate_media {provider,kind,prompt,…}`
  → poll `generate_status {jobId}` → place → `add_generated_media {name,kind,src,trackId,start,duration}` (name & trackId required)
- viral clip from a source range → `create_clip_from_source {sourceSrc,startSec,endSec,vertical,withCaptions,fps}` (seconds!)

## Timeline / tracks / clips
- tracks → `list_tracks` · add → `add_track {kind,name}` · update →
  `update_track {trackId,patch}` (muted/hidden/volume) · remove → `remove_track`
- add clips → `add_video` / `add_image` / `add_audio` / `add_text` / `add_title` /
  `add_shape` / `add_solid` `{trackId,start,duration,…}`
- inspect → `get_clip {clipId}` · find → `find_clips {trackId?,type?}` ·
  gaps → `find_gaps` · snap points → `get_snap_points`
- edit → `update_clip {clipId,patch}` · move → `move_clip` · duplicate →
  `duplicate_clip` · remove → `remove_clip` · ripple delete → `ripple_delete`
- trims → `split_clip` · `slip_clip` · `roll_edit` · `align_clip` · `set_speed`
- transform → `set_crop` · `make_pip` · `set_blend_mode` · `set_mask` ·
  `set_motion_blur` · transitions → `add_transition`

## Audio
- loudness → `measure_loudness {clipId}` · clean voice →
  `clean_audio {clipId,denoise,highpass,deEss}` · normalize →
  `normalize_audio {clipId}` (≈ −14 LUFS)
- fades → `set_audio_fades {clipId,fadeInFrames,fadeOutFrames}`
- ducking → `auto_duck {musicClipId,voiceClipId,level}` (target = MUSIC clip) ·
  manual → `duck_audio {clipId,fromFrame,toFrame,level}`
- silences → `detect_silences` · `auto_cut_silences {clipId,minSilenceSec,paddingMs}` (seconds)

## Captions / transcript
- transcribe a source → `transcribe_source {src,language?}` · read →
  `get_transcript` · detect language → `detect_language`
- auto captions on a clip → `auto_caption {clipId,preset,language?,animated?}`
  (presets: `youtube`,`tiktok`,`minimal`,`bold`; `animated:true` = karaoke word-level)
- from text → `add_subtitles {srt}` OR `{cues:[{start,end,text}]}` (SECONDS)
- export → `export_captions {trackName|trackId,format:"srt"|"vtt"}`

## Color & video FX (ffmpeg ops replace src in place)
- quick look → `apply_look {clipId,look}` (`teal-orange`,`vintage`,`noir`,`warm`,
  `cool`,`bleach`,`cine-green`)
- grade → `set_color_grade {clipId,…(-100..100)}` / `color_grade` (CSS-simple)
- LUT .cube → `apply_lut {clipId,lutPath}` (destructive) · green screen →
  `chroma_key` · `denoise_video` · `sharpen_video` · `stabilize_video`

## Animation / keyframes / markers / notes
- `set_animation` · `add_keyframe` · `remove_keyframe` · chapters/markers →
  `add_marker {frame,label}` / `list_markers` / `update_marker` / `remove_marker`
- notes → `add_note` / `list_notes` / `resolve_note`

## Export & history
- render video → `render_video {format,quality,gpu}` → poll `render_status {jobId}`
  (formats: `h264`/mp4, `prores`/mov, `vp9`/webm, `gif`)
- poster/thumbnail → `export_poster {frame,format}`
- handoff to NLE → `export_nle {format:"fcp7"}` (Premiere/Resolve; loses
  color/effects/shapes)
- `undo` · `redo`
