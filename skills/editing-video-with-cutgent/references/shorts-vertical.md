# Recipe: vertical short / reel (9:16) from a range

## Path A — recommended (one tool does most of it)
1. `transcribe_source {src}` — the `src` must come from `ingest_local_file` and
   have a cached transcript (Path A reads captions from cache).
2. Read the transcript and pick `startSec`/`endSec` for the highlight.
3. `create_clip_from_source {sourceSrc:src, startSec, endSec, title,
   vertical:true, withCaptions:true, fps:30}` → creates a 1080×1920 PROJECT with
   the trimmed range (via `trimStart`) + captions for that range. Returns a
   project `id`.
4. `open_project {id}` to view it live.
5. Reframe (the video is `fit:"cover"`): `update_clip {clipId, patch:{scale,x,y}}`
   or `set_crop` to recenter the subject. ⚠️ Reframing is MANUAL — there is no
   auto-reframe / subject tracking yet.
6. `render_video {format:"h264", quality:"high"}` → poll `render_status`.

## Path B — manual (full control)
`set_resolution_preset {preset:"shorts"}` → `add_video` with
`trimStart = round(startSec×fps)` and `duration = round((endSec−startSec)×fps)`
→ `auto_caption {clipId, preset:"tiktok"}` → `render_video`.

## Common mistakes
- Path A needs a cached transcript for captions — transcribe BEFORE, or it comes
  out without captions.
- The clip uses `trimStart`; it does NOT cut the source file.
- Vertical reframe is manual (known gap).
