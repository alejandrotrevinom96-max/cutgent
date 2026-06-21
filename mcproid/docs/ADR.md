# MCProid — Architecture Decision Records

Decisions are recorded, each capability has a headless gate, nothing ships un-green.

## AF1 — Compose, don't reinvent (the council verdict)
Building a VRoid/engine from scratch is a trap: the stylized **facial rig**
(expressions + visemes) is research-grade, and you'd fight Netflix/NVIDIA/Pixiv.
So MCProid **reuses the rig from a base VRM** and only *customizes* it. The
hard, defensible value is the orchestration + the MCP-first, agent-native interface,
not a mesh/rig generator.

## AF2 — A "living contract" is the single source of truth
`src/contract.mjs` enumerates the standard VRM 1.0 driver ids
(`happy angry sad relaxed surprised neutral` · `aa ih ou ee oh` · `blink` ·
humanoid skeleton · spring bones). Forge guarantees it; validate enforces it. Any
VRM consumer that drives those ids works — producer and consumer can never drift.

## AF3 — Dependency-free, headless core
No Blender, no Unity, no native libs at runtime — only Node + `zlib`. A
"zero-install default" ethos: the whole pipeline runs in CI, in a container, in an
agent sandbox. Geometry in the GLB BIN chunk passes through untouched unless we
deliberately repack it.

## AF4 — One neutral model over VRM 0.x AND 1.0
Real-world bases are split between VRM 0.x and 1.0. `src/vrm.mjs` maps both into a
neutral model (`Joy/Sorrow/Fun → happy/sad/relaxed`, `extensions.VRM ↔ VRMC_vrm`,
`secondaryAnimation ↔ VRMC_springBone`). Every feature works on either format.

## AF5 — Recolor to the pixel ceiling (PBR + MToon + textures)
Color lives in three places: glTF `baseColorFactor`, MToon `shadeColorFactor`, and
**baked PNG textures**. We edit all three — decoding/tinting/re-encoding texture
pixels with a from-scratch zlib PNG codec and repacking bufferViews. This is the
furthest a headless tool can recolor without a GPU.

## AF6 — License-aware (a commercial product must be)
`getMeta` normalizes the VRM license; forge **refuses** to produce a commercial
avatar from a base that forbids commercial use or modification (`requireCommercial`),
and stamps the output's license. Prevents shipping a product built on a base you
aren't allowed to sell.

## AF7 — Gated + MCP-first
`tools/selftest.mjs` is the gate (44 checks across both specs, incl. negative tests,
texture repack, and an MCP boot/`tools/call` smoke test). The interface is MCP
(`create_living_avatar`, `validate_vrm`, `inspect_vrm`, `forge_variants`,
`list_bases`, `list_adapters`) so an AI is a first-class user.

## AF9 — Productization: variants + a license-aware registry
The commercial use case is *many* avatars, safely. `src/variants.mjs` forges a
matrix of editions from one base in a call; `src/registry.mjs` + `bases.json` track
which bases may be used commercially and `verifyBase()` checks a real file's
embedded license against the claim — so you can't accidentally ship on the wrong
license. Part toggling (`src/mesh.mjs`) only shows/hides geometry the base already
has; it never invents parts (that stays behind AF8).

## AF8 — The wall (honest technological ceiling), and how we cross it
MCProid does not generate geometry itself. But the wall is crossed by COMPOSITION,
not by rebuilding an engine (see `docs/ENGINE.md`):
- **Geometry + body rig** → external generators (Higgsfield/Meshy `image_to_3d`).
- **GLB → VRM body base** → DONE in MCProid (`src/import.mjs`): skeleton→humanoid,
  MToon, auto spring bones. The output validates as VRM and reports the gap.
- **Facial rig** (expressions + visemes) → the ONE remaining piece. It is no longer
  "research-grade unsolved": there are services (Polywink) and deformation-transfer
  techniques. It's the one investment worth making (a transfer module / service),
  and it slots behind the same living contract — the core never changes.

So: geometry + body rig + GLB→VRM are handled; only the facial-rig step stands
between "imported body VRM" and "living VRM".
