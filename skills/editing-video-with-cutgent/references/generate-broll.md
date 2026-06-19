# Recipe: AI b-roll (BYO key) & stock

## AI generation (costs the user — confirm first)
1. **Prerequisite:** the user has their API key (Replicate / fal / OpenAI) set in
   Cutgent → Ajustes. Cost is billed DIRECTLY by their provider. ALWAYS confirm
   before generating.
2. `generate_media {provider:"fal"|"replicate"|"openai", kind:"video"|"image"|
   "audio", prompt, model?, durationSec?, aspectRatio?, imageUrl?, voiceId?}` →
   `jobId`. Which `kind` each provider supports depends on the provider and model
   (typically Replicate/fal → image & video, OpenAI → image & voice); the request
   is validated server-side, so an unsupported combo returns a clean error.
3. Poll `generate_status {jobId}` until `status:"done"`; collect `asset.src`
   (and `kind`).
4. Place in one step: `add_generated_media {name, kind, src, trackId, start,
   duration}` (registers the asset AND adds the clip). For b-roll, put it on a
   higher track and/or `make_pip` / `set_blend_mode`.

## No-AI alternative: free stock
`search_stock {query, type:"video"}` → `import_stock {url:downloadUrl, kind, name,
trackId, start, duration}`.

## Common mistakes
- Forgetting to poll and using an empty `src`.
- `aspectRatio` not matching `project.width/height` → clip is framed wrong (adjust
  with `fit`/`scale`); `aspectRatio` is a free string passed to the provider, not
  validated against the project.
- Using `add_image`/`add_video` with a generated asset without registering it —
  prefer `add_generated_media` (does both).
- Assuming the b-roll matches the voice clip length — set `duration` explicitly
  (frames).
