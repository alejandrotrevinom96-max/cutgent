---
name: 3d-animation
description: "Craft-level guidance for professional 3D modeling, rigging, and animation, tool-agnostic across Blender, Maya, Houdini, and Cinema4D. Use when modeling, rigging, texturing, lighting, or animating a 3D asset or scene; when judging whether 3D work is production-quality; or when choosing topology, edge flow, UVs, PBR material values, lighting setups, or animation timing and spacing. Covers the 12 principles of animation, reference-and-blocking-first workflow, quad topology and deformation, scale and units, shading and PBR, lighting, and rigging basics, plus an honest note on where generative 3D helps versus where hand craft is still required. Pairs with (does not replace) the image/video generation pack. The personal layer (the user's style and projects, via recall) overrides generic defaults."
---

# 3D Animation & Modeling Craft

Tool-agnostic craft for production-quality 3D. The tool (Blender/Maya/Houdini/C4D)
is a detail; the craft below transfers. Your `personal/` layer (projects, render
targets, house style, naming conventions), via recall, **overrides** anything here.

## Decision procedure (in order)

1. **Reference first.** Never model or animate from imagination alone. Gather
   image/video reference for shape, proportion, weight, and timing.
2. **Block before polish.** Big shapes / key poses before detail. Animation:
   **blocking → spline → polish**. Don't smooth splines until poses read.
3. **Check the silhouette constantly.** Black out the form; if it doesn't read as a
   flat shape, detail won't save it.
4. **Set scale/units before anything downstream.** Wrong scale breaks sim, lighting
   falloff, and DOF. 1 unit = 1 m (or studio standard) from frame zero.
5. **Topology serves deformation.** Build edge flow for how it bends, not just how
   it looks at rest.
6. **Lighting is motivated.** Every key has a reason (sun, window, lamp). Light to
   shape the silhouette, not flatten it.
7. **Judge against the rubric** — binary, no vibes.

## The 12 principles (biggest quality levers)

- **Timing & Spacing** — frame count and distribution; spacing (ease) is *the*
  difference between mechanical and alive. Linear = dead.
- **Squash & Stretch** — volume-preserving deformation; conveys mass.
- **Anticipation** — a wind-up before an action.
- **Follow-through & Overlapping action** — parts settle at different rates; drag.
- **Arcs** — natural motion travels in arcs, rarely straight lines.
- **Slow in / slow out** — bodies accelerate/decelerate.
- **Staging** — direct the eye; one clear idea per shot/pose.
- **Exaggeration** — push past literal reality for readability.
- **Secondary action** — supports the main action without stealing it.
- **Solid drawing / weight** — believable mass, balance, contact, no float.
- **Appeal** — clear, interesting design; asymmetry over "cute by default."
- **Straight-ahead vs pose-to-pose** — pose-to-pose for control, straight-ahead
  for sims/effects.

## Modeling craft

- **All-quad in deforming areas.** Tris/ngons at joints/mouth/brow pinch and shade
  badly. Static hard-surface tolerates tris where it never deforms.
- **Edge flow follows form/muscle**; even density where it bends.
- **UVs:** hidden seams; uniform texel density; no unintended overlap; pack efficiently.

## Shading / PBR

Plausible PBR values (dielectric albedo in a sane range; metals colored in base
color, ~0 elsewhere). Roughness drives realism more than color — vary it; uniform
roughness reads CG.

## Lighting

**Three-point** (key/fill/rim) baseline; **HDRI** for grounded environment light
and reflections; combine. Control contrast; flat shadowless light kills form.

## Rigging basics

Clean joint placement at real pivots; sensible weight painting; no candy-wrap
twisting. Test extreme poses before handing to animation.

## Where generative / AI 3D helps vs doesn't

- **Helps:** ideation, fast set-dressing/background props, scan/photogrammetry
  cleanup starting points, texture/HDRI generation, mocap cleanup assists, kitbash.
- **Still needs hand craft:** clean deforming topology, hero rigs, nuanced
  performance timing, art-directed lighting, final polish. Treat generative output
  as raw stock to retopo/clean/direct — never the deliverable.
