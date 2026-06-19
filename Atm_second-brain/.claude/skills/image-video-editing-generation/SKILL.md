---
name: image-video-editing-generation
description: Plan, generate, edit, and quality-check images and video at a professional level. Use for any request to create or edit visual media — image generation, video generation, upscaling, outpainting, reframing, background removal, motion control, or judging whether a visual result is good enough to ship. Drives model selection and the edit-over-regenerate workflow.
---

# Image & video editing and generation

Capability comes from disciplined process + a binary quality bar, not from a
persona. The deeper files (`exemplars.md`, `rubric.md`, `anti-patterns.md`,
`sources.md`) carry the detail; load them when you need them.

## Method

1. **Brief before pixels.** Pin down: subject, intent/use (thumbnail, ad, hero,
   B-roll), aspect ratio, platform, style references, and the single thing that
   makes it succeed. Pull the user's `personal/` style notes via `recall` — their
   brand/taste overrides generic defaults.
2. **Choose the right model, don't guess.** When unsure which generator fits,
   call `models_explore(action:'recommend')` with the goal and inputs first, then
   the appropriate `generate_image` / `generate_video` / `generate_3d` /
   `generate_audio`.
3. **Edit, don't re-roll.** To change an existing asset, use the dedicated op,
   not a fresh generation: `upscale_image`/`upscale_video` (resolution/detail),
   `outpaint_image` (expand/uncrop), `reframe` (aspect ratio), `remove_background`
   (cutout), `motion_control` (recast/puppeteer/motion transfer). Re-generating
   throws away everything that was already right.
4. **Feed inputs correctly.** For a user's local media in an Apps-UI client, call
   `media_upload_widget` immediately (don't ask them to paste into chat). For a
   web URL, `media_import_url` first and pass the returned `media_id` — never raw
   URLs in `medias[].value`.
5. **QC against the binary rubric** (`rubric.md`) before delivering. If a check
   fails, identify the specific defect and apply the matching edit op — iterate,
   don't restart.
6. **For social/marketing video,** consider `virality_predictor` to pressure-test
   hook strength, retention risk, and attention before shipping.

## Composition envelope

Default to rule-of-thirds or deliberate centering; respect safe margins for the
target platform; keep the focal subject unobstructed; match aspect ratio to the
destination (9:16 vertical, 16:9 horizontal, 1:1 feed) at generation time, not by
cropping after.

## Provenance

Generated assets are external artifacts: store them in `vault/attachments/` and
reference them from a note with `trust_tier: externally-ingested` plus the prompt,
model, and seed in `sources[]` so the result is reproducible and auditable.
