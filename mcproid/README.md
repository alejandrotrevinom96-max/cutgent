# MCProid

> **MCP + VRoid** — an MCP-first "VRoid for AIs". A standalone product.

**MCProid forges "living" VRM avatars** — rigged with expressions, visemes and
spring-bone physics — from a **base VRM** you own + a small **design spec**, by code
(`bin/forge.mjs`) or by an AI agent (the MCP server). The output is **standard VRM
1.0** that loads in any VRM consumer (a `@pixiv/three-vrm` web app, Unity/UniVRM,
VTuber tools, game engines…). It does **not** depend on any specific app.

## Why this exists (the council verdict)
There is **no turnkey, MCP-first product that lets an AI *create* a living, stylized
avatar end-to-end**. The pieces are scattered — Blender MCP (generic geometry),
agent-vrm-mcp (drives a VRM), lipsync APIs (mouth only) — and the market leader for
programmatic rigged avatars, **Ready Player Me, shut down in Jan 2026** (Netflix),
stranding 25k+ developers. Building a VRoid/engine *from scratch* is a trap (the
stylized facial rig is research-grade; you'd fight Netflix/NVIDIA/Pixiv). The
defensible shape is an **orchestration layer that composes existing rig tech** —
reuse the rig from a base, automate the customization, expose it over MCP. That's
MCProid.

## The one honest constraint
A bespoke, on-design, **face-rigged** avatar can't be fully auto-generated today.
So the model is **one base → infinite avatars**:

> Author **one** rigged base ONCE (your VRoid export, a commission, or a CC0 model
> you own) → `MCProid` recolors / re-skins / versions it **automatically and
> repeatably** forever.

The built-in **fixture** base is a *test artifact only* (it proves the pipeline is
green). Supply a real base for the real look.

## The living contract
`src/contract.mjs` is the single source of truth for what "living" means — the
standard VRM 1.0 ids any consumer drives:
- **Expressions:** `happy angry sad relaxed surprised neutral`
- **Visemes:** `aa ih ou ee oh`
- **Extras:** `blink` · humanoid skeleton · spring-bone physics

`src/validate.mjs` asserts all of it on every output (headless, no WebGL), including
that required expressions actually **drive** something (have binds), not just exist.

## Capabilities (the headless SOTA pass)
- **Dual format:** reads & writes **VRM 0.x and 1.0** via one neutral model
  (`Joy/Sorrow/Fun → happy/sad/relaxed`, `extensions.VRM ↔ VRMC_vrm`, …).
- **Recolor to the pixel:** glTF `baseColorFactor` **+** MToon `shadeColorFactor`
  **+ baked PNG textures**, in `multiply` or shading-preserving **`hue`** mode (a
  from-scratch zlib PNG codec tints actual pixels and repacks the GLB binary).
- **Part toggling:** show/hide existing named parts (jacket, glasses…) — never
  invents geometry (that's AF8).
- **Proportions:** humanoid bone scaling. **Physics:** spring profiles
  (`soft/natural/bouncy`) for fluid hair/skirt.
- **Batch / variants:** forge a whole matrix of editions from one base in one call.
- **License-aware registry:** pick/verify bases by commercial rights; forge
  refuses a commercial output from a base that forbids it, and stamps the license.
- **Reproducible:** every forge returns a `manifest` of what changed.
- **GLB → VRM import:** convert a generic rigged GLB (Higgsfield/Meshy
  `image_to_3d`) into a VRM body base — skeleton→humanoid, MToon, auto spring
  bones — and get an honest report of the remaining facial-rig gap (`import_glb`).
- **MCP tools (7):** `create_living_avatar`, `validate_vrm`, `inspect_vrm`,
  `forge_variants`, `import_glb`, `list_bases`, `list_adapters`.
- **AF8 adapter seam:** `blender` / `higgsfield-3d` adapters define how to PRODUCE
  a base (new geometry/rig). See **[`docs/ENGINE.md`](docs/ENGINE.md)** for the
  full composition-engine pipeline (Higgsfield → import → forge).

See [`docs/ADR.md`](docs/ADR.md) for the decisions and **AF8 for the honest
technological ceiling** (no new geometry / blendshapes / AI mesh — that needs a 3D
engine; cross it with an adapter behind the same contract).

## Use it
```bash
# forge from the Luna spec onto your base, into any consumer's asset path
node bin/forge.mjs --spec specs/luna.json --base /path/to/base.vrm --out /path/to/app/avatar.vrm

# shading-preserving hue recolor; require a commercial-OK base
node bin/forge.mjs --spec specs/luna.json --base base.vrm --texture-mode hue --require-commercial

# batch a matrix of editions from one base
node bin/forge.mjs --spec specs/luna.json --base base.vrm \
                   --variants specs/variants.example.json --outdir out/variants

# no base? uses the fixture (placeholder rig) so you can see the pipeline run
node bin/forge.mjs --spec specs/luna.json --out out/luna.vrm
```

### As an MCP server (agent-native)
`src/mcp.mjs` is a stdio MCP server exposing 6 tools — `create_living_avatar`,
`validate_vrm`, `inspect_vrm`, `forge_variants`, `list_bases`, `list_adapters`.
Point any MCP client (Claude, Cursor, …) at `node src/mcp.mjs`.

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
**51 checks** across both VRM specs: GLB round-trip, dual-format detection,
GLB→VRM import (skeleton map + auto springs + honest facial-rig gap report),
fixture validity, normalized accessors, forge correctness (factor + MToon +
texture pixel recolor in multiply & **hue**), part toggling, proportions, spring
tuning, batch variants + matrix, license registry + mismatch detection, the AF8
adapter seam (honest), deep drivability, repack integrity (untinted views
byte-preserved), negative tests, the standard-driver-id guard, and an MCP
boot/`tools/call` smoke test (6 tools).

## Roadmap (genuinely beyond the ceiling now)
- True hair/outfit **mesh swaps** (new geometry) — needs an AF8 adapter.
- HSV recolor that also shifts hue per-region / segmentation masks.
- Live hot-reload watcher in a consumer app (write-through exists today).
- **Crossing AF8:** implement `blender` / `higgsfield-3d` `produceBase()` for real
  (geometry + a facial-rig authoring step) behind the same living contract.
