# MCProid as a living-avatar ENGINE (by composition)

You don't build a 3D engine to have one — you **orchestrate** the best generative
pieces behind one contract. MCProid is the conductor; the heavy generators are
pluggable adapters. You ride the frontier (each generator improves on its own)
instead of fighting it (rebuilding mesh-gen vs ByteDance/Tencent/Stability).

## The end-to-end pipeline
```
 image / turnaround
   │
   ▼  [adapter] Higgsfield/Meshy generate_3d (enable_rigging)     ← geometry + BODY rig
 textured GLB + skeleton
   │
   ▼  mcproid import_glb  (src/import.mjs)                         ← DONE, headless
 VRM 1.0 BODY base: humanoid map + MToon + auto spring bones
   │
   ▼  [face-rig step]  deformation-transfer from a donor  OR  a service (Polywink) ← the gap
 + expressions + visemes
   │
   ▼  mcproid forge / validate / variants / registry / MCP        ← DONE, headless
 LIVING VRM  (recolored, licensed, validated, batchable, agent-callable)
```

## What's built vs. what's the gap (honest)
| Stage | Who | Status in MCProid |
|-------|-----|-------------------|
| Geometry (image→mesh) | Higgsfield/Meshy, Tripo, Hunyuan3D | external API (credits) |
| Body auto-rig | Meshy / Mixamo | external (comes with the GLB) |
| **GLB → VRM** (humanoid map, MToon, spring bones) | **MCProid** | ✅ `import_glb` (gated) |
| **Facial rig** (expressions + visemes) | deformation-transfer / Polywink | ⛳ **the one gap** |
| Package / recolor / variants / license / validate | **MCProid** | ✅ (gated) |
| MCP / agent interface | **MCProid** | ✅ (7 tools) |

## Why composition, not a monolithic engine
- **Geometry is commoditizing** — building your own loses on compute + research.
- **The moat is the orchestration** + the agent-native MCP + the living contract +
  license safety + (optionally) a proprietary facial-rig step.
- **Adapters mean zero core rewrite** when you swap or add a generator.

## The one investment worth making: the facial-rig step
This is the only piece that isn't "call an API + JSON". Two routes:
1. **Service** (e.g. Polywink "blendshapes on demand"): fastest, per-asset cost.
2. **Deformation transfer** (build it): copy a donor VRM's expression/viseme deltas
   onto the imported mesh via mesh correspondence. This is the moat — but it needs
   real mesh math (correspondence + solve), so it breaks the dependency-free ethos
   (likely Python/Blender or a native lib). Treat it as a funded R&D module behind
   the same living contract; everything downstream already works.

## Try the built part today
```bash
# (1) generate a rigged GLB with the Higgsfield generate_3d MCP -> save base.glb
# (2) convert it to a VRM body base — headless, free:
node bin/forge.mjs --from-glb base.glb --out out/body.vrm
# mcproid prints exactly what's still missing (the facial rig).
```
