# Recipe: edit a ~10-min YouTube video end-to-end (north-star)

Goal: turn one long recording into a finished YouTube upload. All times in
FRAMES (`frames = round(seconds × project.fps)`) unless a step says seconds.
`get_project` first to learn `fps`/`width`/`height` and real ids.

## Steps
1. **Project.** `new_project {name, width:1920, height:1080, fps:30}` — or
   `set_resolution_preset {preset:"youtube-1080p"}` on the current one. (Creates
   Video / overlays / Audio tracks.)
2. **Ingest the recording.** `ingest_local_file {path:"C:\\…\\recording.mp4"}` →
   returns a servable `src` (`/assets/…`). Tools can't read raw disk paths.
3. **Find the Video track.** `list_tracks` → grab its `trackId`.
4. **Place the clip.** `add_video {trackId, src, start:0, duration}` where
   `duration` (frames) = round(durSeconds × fps). If the exact length is unknown,
   set a large duration and fix later with `update_clip`, or read `durationSec`
   from the transcript. Save the returned `clipId`.
5. **Transcribe.** `transcribe_source {src}` (autodetects language; if it returns
   needs_language, ask the user and re-call with `language`). Used for captions
   and chapters.
6. **Cut silences (biggest time-saver).** `auto_cut_silences {clipId,
   minSilenceSec:0.5, paddingMs:120}` (seconds). ⚠️ It ripples ONLY this clip's
   track — do it BEFORE adding music/overlays or they desync. Re-query
   `get_project`/`find_clips` afterward (ids shift).
7. **Captions.** `auto_caption {clipId, preset:"youtube"}` — AFTER the silence cut
   so timings match the trimmed video. Creates/reuses the "Subtítulos" track.
8. **Color.** Quick: `apply_look {clipId, look:"warm"}` (or `teal-orange`).
   Fine: `set_color_grade {clipId, …}` (values −100..100, 0 = neutral). Apply to
   the VIDEO clip, not the track.
9. **Clean the voice.** `clean_audio {clipId, denoise:true}` then
   `normalize_audio {clipId}` (≈ −14 LUFS). Verify with `measure_loudness {clipId}`.
   (Order matters: denoise BEFORE normalize.)
10. **Music + ducking.** `add_track {kind:"audio", name:"Música"}` →
    `import_stock`/`add_audio` onto that `trackId` → `auto_duck {musicClipId,
    voiceClipId, level:0.2}` (target = the MUSIC clip).
11. **Chapters (optional).** For each topic from the transcript:
    `add_marker {frame, label}`.
12. **Export.** `render_video {format:"h264", quality:"high", gpu:true}` →
    `jobId`; poll `render_status {jobId}` until `status:"done"`; read `url`.
    Thumbnail: `export_poster {frame, format:"jpeg"}`.

## Common mistakes
- Skipping `ingest_local_file` (raw paths fail).
- Computing seconds for frame-based tools.
- Running `auto_cut_silences` AFTER adding music (desyncs other tracks).
- Asking to render before the transcript/cuts finish (async — poll first).
