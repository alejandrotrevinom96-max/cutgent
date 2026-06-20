# Avatar — design reference & build guide

The cockpit's avatar (Surface C). This is the canonical look + how to turn it into a
live, fluid VRM that the affect engine drives. **Original design** (anime-companion
genre as inspiration, not a copy of any existing character).

## The character (locked brief)

- **Style:** anime-stylized 3D, clean cel-shading (Genshin / VRoid look) — rigs cleanly as a VRM, very expressive face.
- **Vibe:** *soft goth* — dark and elegant yet gentle and approachable (reads serious in business, warm in conversation).
- **Hair:** long, flowing, **platinum-white / silver** (cool soft sheen) — long hair = maximum fluid movement via spring bones.
- **Eyes / signature accent:** muted **amethyst violet**.
- **Wardrobe:** short above-the-knee soft-goth dress (velvet + subtle lace), **black thigh-high stockings + boots**, antique-silver accents, soft plum undertones. Legs visible.
- **Build:** clean appealing anime proportions, slightly fuller bustline.
- **Palette:** black / charcoal + platinum-white hair + amethyst-violet accent + antique silver.

## Reference pack (Higgsfield / Nano Banana Pro)

Download each from your Higgsfield history (the CDN blocks hotlinking) and save it
into `docs/avatar-refs/` with the filename below, so the pack lives in the repo.

| file | what it locks | job id |
|------|----------------|--------|
| `avatar-refs/portrait.png`     | face + style (canonical)            | `e30edbe3-597f-4b60-8a54-71bd929a47e0` |
| `avatar-refs/fullbody.png`     | silhouette, outfit, legs (canonical)| `f745fe4f-2f82-4c3a-9af2-4ac80e0364de` |
| `avatar-refs/expressions.png`  | 5 expressions for the affect engine | `2bc84e24-8b6e-48ec-8cde-6507ae3d2b9e` |

The expression sheet is **neutral · warm smile · serious · laughing · concerned** —
exactly the states `src/shared/affect/affect.mjs` produces (happy / relaxed / neutral
/ sad), so the modeled BlendShapes should match those.

## Build the VRM (recommended: VRoid Studio, free, 100% yours)

1. Install **VRoid Studio** (vroid.com/en/studio).
2. New character; match the face to `portrait.png` — long white/platinum hair, amethyst eyes.
3. **Hair:** long and flowing; keep it as separate hair groups so spring bones can sway it.
4. **Outfit:** short dress + black thigh-highs + boots per `fullbody.png` (texture editor or imported items).
5. **Expressions (BlendShapes):** set Joy / Sorrow / Angry / Surprised / Relaxed so they read like `expressions.png`. The affect engine drives these by name (happy/sad/angry/surprised/relaxed/neutral).
6. **Spring bones:** enable on hair and skirt → that's the *fluid, not rigid* movement you wanted.
7. **Export VRM** (VRM 1.0).
8. Drop the file at **`public/avatar.vrm`**.

(Alternative: commission a VRM artist on Booth / VGen and hand them these 3 refs.)

## How she comes alive

Once `public/avatar.vrm` exists, no extra wiring is needed:

- `src/shared/avatar/visemeMap.mjs` → lip-sync on the audio clock.
- `src/shared/affect/affect.mjs` → demeanor by **topic** (serious for philosophy,
  focused for business, warm for counsel) + **moment** (laughs at something funny,
  softens to concern if you're overwhelmed).
- `VrmStage.tsx` → applies expression weights with frame-smoothing (fluid, never
  snapped), plus blink / gaze / idle breathing that gets livelier with arousal.

So she reacts and shifts on her own as the conversation changes — which is exactly
the behavior you asked for.
