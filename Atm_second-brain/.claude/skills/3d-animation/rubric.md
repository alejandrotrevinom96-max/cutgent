# 3D Animation & Modeling — Binary Rubric

Check a line ONLY if unambiguously true. Any unchecked line is a concrete defect.
Your `personal/` standards (studio specs, render targets) override these defaults.

## Modeling / topology
- [ ] Mesh is all-quad in every area that deforms (no tris/ngons at joints, mouth, brow).
- [ ] Edge loops follow form/muscle (eyes, mouth, shoulders, elbows, knees).
- [ ] Polygon density is appropriate: even where it bends, economical where it doesn't.
- [ ] No non-manifold geometry, no flipped/inconsistent normals.
- [ ] Scale/units are correct (1 unit = 1 m or studio standard); object is real-world sized.

## UVs / texturing / shading
- [ ] UVs have no unintended overlap and roughly uniform texel density.
- [ ] Seams are hidden or placed where they won't show.
- [ ] PBR base-color values are plausible (no pure 0/255; metals colored in base, dielectrics ~0 metalness).
- [ ] Roughness varies meaningfully and is not uniformly flat.

## Lighting / render
- [ ] Every key light is motivated (a real source justifies it).
- [ ] Lighting shapes the silhouette and form (not flat/shadowless).
- [ ] Final render is denoised with no visible fireflies or splotches.
- [ ] No clipping/blown-out highlights or crushed blacks (unless intentional).

## Animation
- [ ] Silhouette of each key pose reads clearly when blacked out.
- [ ] Timing and spacing are intentional (eases present; nothing linearly interpolated by default).
- [ ] Motion travels in arcs, not straight lines, where natural.
- [ ] Anticipation precedes significant actions.
- [ ] Follow-through / overlapping action present (parts settle/offset, not all at once).
- [ ] Weight reads: contacts, balance, and mass are believable (no floaty motion).
- [ ] No interpenetration (feet through floor, hand through body, self-intersection).
- [ ] Feet/contacts do not slide (no foot-skate on planted feet).
- [ ] One clear idea per shot/pose (staging directs the eye).
