# avatar-forge — Architecture Decision Records

Same discipline as the cockpit (ADR D1–D8) and the affect engine: decisions are
recorded, each capability has a headless gate, nothing ships un-green.

## AF1 — Compose, don't reinvent (the council verdict)
Building a VRoid/engine from scratch is a trap: the stylized **facial rig**
(expressions + visemes) is research-grade, and you'd fight Netflix/NVIDIA/Pixiv.
So avatar-forge **reuses the rig from a base VRM** and only *customizes* it. The
hard, defensible value is the orchestration + the cockpit (affect + voice), not a
mesh/rig generator.

## AF2 — A "living contract" is the single source of truth
`src/contract.mjs` enumerates exactly what the cockpit drives
(`happy angry sad relaxed surprised neutral` · `aa ih ou ee oh` · `blink` ·
humanoid skeleton · spring bones). Forge guarantees it; validate enforces it. The
producer and the consumer can never drift.

## AF3 — Dependency-free, headless core
No Blender, no Unity, no native libs at runtime — only Node + `zlib`. Mirrors the
cockpit's "zero-install default" ethos: the whole pipeline runs in CI, in a
container, in an agent sandbox. Geometry in the GLB BIN chunk passes through
untouched unless we deliberately repack it.

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
`tools/selftest.mjs` is the gate (32 checks across both specs, incl. negative tests,
texture repack, and an MCP boot/`tools/call` smoke test). The interface is MCP
(`create_living_avatar`, `validate_vrm`, `inspect_vrm`) so an AI is a first-class user.

## AF9 — Productization: variants + a license-aware registry
The commercial use case is *many* avatars, safely. `src/variants.mjs` forges a
matrix of editions from one base in a call; `src/registry.mjs` + `bases.json` track
which bases may be used commercially and `verifyBase()` checks a real file's
embedded license against the claim — so you can't accidentally ship on the wrong
license. Part toggling (`src/mesh.mjs`) only shows/hides geometry the base already
has; it never invents parts (that stays behind AF8).

## AF8 — The wall (honest technological ceiling)
avatar-forge **cannot** synthesize new geometry, author new blendshapes/visemes
from nothing, retopologize, or AI-generate a mesh. Those require a 3D engine
(Blender/Unity) or a generative-3D service, and — for a *stylized facial rig* —
remain unsolved at production quality. That is exactly why the model is
**one human-authored base (VRoid/commission/CC0) → infinite automated avatars**.
Crossing this wall later means adding a Blender-headless or Higgsfield-3D *adapter*
behind the same contract — not changing the core.
