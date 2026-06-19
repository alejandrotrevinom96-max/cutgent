# Anti-patterns — detectable failures and the fix

1. **Ngons/triangles in deforming areas.** Detect: tris/5+-sided faces at joints;
   pinching when posed. Fix: retopologize to quads; route loops along the bend.

2. **Floaty / weightless motion.** Detect: drifts, never settles, no firm contacts.
   Fix: add weight via spacing (accel in / decel out), squash/stretch, contact frames.

3. **Linear interpolation everywhere.** Detect: constant velocity, robotic, flat
   F-curves. Fix: ease in/out; break tangents intentionally.

4. **Uniform timing / everything moves at once.** Detect: all parts start/stop on
   the same frames. Fix: stagger and overlap; lead with the driving mass.

5. **Flat, shadowless lighting.** Detect: even illumination, silhouette disappears.
   Fix: motivate a key, set a contrast ratio with fill, add a rim.

6. **Wrong scale / units.** Detect: DOF/physics/falloff look off; sim explodes. Fix:
   set units at start; model to real dimensions; reset transforms before sim/light.

7. **Blown-out / implausible PBR.** Detect: pure-white/black albedo, metalness as a
   dimmer, uniform roughness. Fix: mid-range dielectric albedo; metals in base color;
   vary roughness; expose so highlights aren't clipped.

8. **Fireflies / undersampled noise.** Detect: bright stray pixels, splotchy GI. Fix:
   raise samples or clamp indirect, fix tiny/intense lights and bad materials, denoise.

9. **Foot-skate and interpenetration.** Detect: planted feet slide; hands pass
   through body. Fix: pin contacts (IK/foot locks), corrective poses, check angles.
