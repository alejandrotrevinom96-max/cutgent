# VROID BUILD — "do it now" sheet

The last piece: sculpt the avatar in **VRoid Studio** and export `avatar.vrm`.
Everything else (affect engine, voice Luna, cockpit) is done and waiting for this file.

**Great news:** the cockpit consumes the **VRM 1.0 standard** expressions/visemes/blink,
which VRoid **exports by default**. You do NOT need custom blendshapes — just make the
standard ones look right and confirm none are empty.

## References to keep open (from docs/avatar-refs/)
| ref | use while sculpting |
|-----|---------------------|
| `portrait.png`    | face, eyes (amethyst), hair color/shape |
| `fullbody.png`    | silhouette, outfit, legs, proportions |
| `turnaround.png`  | front/side/back — eyeball proportions on a 2nd screen |
| `expressions.png` | how Joy/Sorrow/Angry/Surprised/Relaxed should look |

## Build order (~30–60 min)
1. **New avatar** → female base (VRoid Studio, free: vroid.com/en/studio).
2. **Face** — match `portrait.png`: big soft eyes, gentle chin. Take your time; the face sells her.
3. **Eyes** — iris **amethyst/violet** + soft highlight (her signature).
4. **Hair** — long, flowing groups past mid-back + face-framing strands; **platinum/white**, cool tint. Keep groups separate (front/side/back).
5. **Hair physics** — enable **Spring Bones / sway** on the long groups (this is "fluid, not stiff"). Verify in preview by moving the head.
6. **Body** — clean anime proportions; slightly fuller build (like B2).
7. **Outfit** — short dark velvet-feel dress + **black thigh-high stockings** + boots; silver accents. Skirt as its own piece.
8. **Skirt physics** — Spring Bones on the skirt so it moves with her.
9. **Expressions** — open each VRM preset and make it read clearly (the affect engine drives them BY NAME):
   - `happy` = wide warm smile · `sad` = soft downturn · `angry` = subtle brow ·
     `surprised` = raised brows + open · `relaxed` = soft calm · `neutral` = rest.
10. **Confirm built-ins exist** (VRoid adds these automatically — just don't break them):
    - Visemes: `aa` `ih` `ou` `ee` `oh` (lip sync) · `blink` (auto blink) · LookAt (eye tracking).
11. **Export** → *Export as VRM* → **VRM 1.0**. Reasonable polygon/material reduction for real-time.

## Turn her on
1. Put the file at **`atm-cockpit/public/avatar.vrm`**.
2. `npm install` (first time) → `npm run dev`.
3. Talk to her: ask something **funny**, then something **serious** → face, energy and
   **voice** shift on their own (affect engine + visemes + prosody). Watch hair + skirt sway.

If something looks off, it's almost always: an empty expression preset, or Spring Bones
not enabled on hair/skirt. Both are fixable in VRoid and re-exported — nothing in the
cockpit changes.
