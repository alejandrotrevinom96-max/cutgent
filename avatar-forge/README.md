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

`src/validate.mjs` asserts all of it on every output (headless, no WebGL), including
that required expressions actually **drive** something (have binds), not just exist.

## Capabilities (the headless SOTA pass)
- **Dual format:** reads & writes **VRM 0.x and 1.0** via one neutral model
  (`Joy/Sorrow/Fun → happy/sad/relaxed`, `extensions.VRM ↔ VRMC_vrm`, …).
- **Recolor to the pixel:** glTF `baseColorFactor` **+** MToon `shadeColorFactor`
  **+ baked PNG textures** (a from-scratch zlib PNG codec tints the actual pixels
  and repacks the GLB binary — see `src/png.mjs`, `src/texture.mjs`).
- **Proportions:** humanoid bone scaling. **Physics:** spring profiles
  (`soft/natural/bouncy`) for fluid hair/skirt.
- **License-aware:** refuses a commercial forge from a base that forbids it;
  stamps the output license.
- **Reproducible:** every forge returns a `manifest` of what changed.
- **MCP tools:** `create_living_avatar`, `validate_vrm`, `inspect_vrm`.

See [`docs/ADR.md`](docs/ADR.md) for the decisions and **AF8 for the honest
technological ceiling** (no new geometry / blendshapes / AI mesh — that needs a 3D
engine; cross it later with an adapter behind the same contract).

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
**32 checks** across both VRM specs: GLB round-trip, dual-format detection,
fixture validity, normalized accessors, forge correctness (factor + MToon +
**texture pixel** recolor), proportions, spring tuning, license guard, deep
drivability, repack integrity (untinted views byte-preserved), negative tests,
the cockpit-linkage guard, and an MCP boot/`tools/call` smoke test.

## Roadmap (beyond the current ceiling)
- Hair/outfit **mesh** swaps (needs a base with separable parts).
- Hue/HSV-aware texture recolor (current is multiplicative tint).
- Batch/variant matrices; a license-aware base registry.
- Direct write-through to a running cockpit (hot reload).
- **Crossing AF8:** a Blender-headless or Higgsfield-3D *adapter* (new geometry /
  blendshapes) behind the same living contract.
