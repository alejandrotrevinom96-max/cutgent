# Recipe: color — look / grade / LUT

Three levels, least → most involved. Apply to the VIDEO/IMAGE clip (not the
track, not text/shape clips).

## 1. Predefined look (fast, no files)
`apply_look {clipId, look}` — `teal-orange`, `vintage`, `noir`, `warm`, `cool`,
`bleach`, `cine-green`. Merges with the existing grade.

## 2. Pro grade (CSS, non-destructive, undo round-trips)
`set_color_grade {clipId, temperature?, tint?, exposure?, contrast?, saturation?,
lift?, gamma?, gain?}` — values −100..100, 0 = neutral. (`color_grade` is the
simpler CSS-filter variant: brightness/contrast/saturate/…; use one or the other,
don't mix concepts.)

## 3. Real .cube LUT (ffmpeg, destructive, slow)
`apply_lut {clipId, lutPath:"C:\\luts\\film.cube"}` — burns the LUT and REPLACES
the clip `src`. `lutPath` is a path on the user's disk. Reversible only via `undo`
of the document (the generated asset stays).

## Related
Green screen → `chroma_key {clipId,…}` (also ffmpeg, replaces src).

## Common mistakes
- Expecting `apply_lut` not to re-encode (it does — slow, doc-undo only).
- Applying a look to a text/shape clip (color applies to video/image).
- Treating `set_color_grade` values as 0..n multipliers (they are −100..100).
