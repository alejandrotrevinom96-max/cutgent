# avatar-forge

**MCP-first pipeline that forges "living" VRM avatars** — rigged with expressions,
visemes and spring-bone physics — from an owned/CC0 **base VRM** + a small **design
spec**. The forged `.vrm` drops straight into [`atm-cockpit`](../atm-cockpit) and is
driven live by its affect engine + voice (Luna).

## Why this exists (the council verdict)
We checked the market: there is **no turnkey, MCP-first product that lets an AI
*create* a living, stylized avatar end-to-end**. The pieces are scattered — Blender
MCP (generic geometry), agent-vrm-mcp (drives a VRM), lipsync APIs (mouth only) —
and the market leader for programmatic rigged avatars, **Ready Player Me, shut down
in Jan 2026** (Netflix). Building a VRoid/engine *from scratch* is a trap (the
stylized facial rig is research-grade; you'd fight Netflix/NVIDIA/Pixiv). So the
defensible shape is an **orchestration layer that composes existing rig tech** —
reuse the rig from a base, automate the customization, expose it over MCP. That's
this repo. Our cockpit (affect + voice) is the differentiator nobody else has.

## The one honest constraint
A bespoke, on-design, **face-rigged** avatar can't be fully auto-generated today.
So the model is **one base → infinite avatars**:

> Author **one** rigged base ONCE (your VRoid export, a commission, or a CC0 model
> you own) → `avatar-forge` recolors / re-skins / versions it **automatically and
> repeatably** forever.

The built-in **fixture** base is a *test artifact only* (it proves the pipeline is
green). Supply a real base for the real look.

## The living contract
`src/contract.mjs` is the single source of truth for what "living" means — exactly
the ids the cockpit drives:
- **Expressions:** `happy angry sad relaxed surprised neutral`
- **Visemes:** `aa ih ou ee oh`
- **Extras:** `blink` · humanoid skeleton · spring-bone physics

`src/validate.mjs` asserts all of it on every output (headless, no WebGL).

## Use it
```bash
# forge from the Luna spec onto your base, write into the cockpit
node bin/forge.mjs --spec specs/luna.json --base /path/to/base.vrm \
                   --out ../atm-cockpit/public/avatar.vrm

# no base? uses the fixture (placeholder rig) so you can see the pipeline run
node bin/forge.mjs --spec specs/luna.json --out out/luna.vrm
```

### As an MCP tool (agent-native)
`src/mcp.mjs` is a stdio MCP server exposing one tool:
`create_living_avatar({ spec, basePath?, outPath? })`. Point any MCP client
(Claude, Cursor, …) at `node src/mcp.mjs`.

## Spec format (`specs/luna.json`)
```json
{
  "name": "Luna",
  "palette": { "hair": "#E9E7F2", "iris": "#7B4FA6", "outfit": "#171019" },
  "license": { "commercialUsage": "...", "avatarPermission": "...", "url": "..." }
}
```
Palette keys match material names (case-insensitive substring) and recolor
`baseColorFactor`.

## Gate
```bash
npm test    # node tools/selftest.mjs — must be ALL GREEN
```
Covers: GLB round-trip, fixture validity, forge correctness, recolor, metadata,
the cockpit-linkage guard, a negative test, and an MCP boot/`tools/call` smoke test.

## Roadmap
- Texture-atlas recolor (not just `baseColorFactor`) for textured bases.
- Hair/outfit **mesh** swaps (needs a base with separable parts).
- Proportion morphing via humanoid bone scaling.
- Batch/variant generation; license-aware base registry.
- Direct write-through to a running cockpit (hot reload).
