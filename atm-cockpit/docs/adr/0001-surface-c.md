# ADR 0001 — Surface C: avatar + live graph + voice + generative widgets

Status: **Accepted** (research workflow closed — technology ceiling reached)
Date: 2026-06-19
Scope: a desktop app that gives the ATM second brain a visible body and a live mind.

This ADR is the durable output of a two-round agent research swarm (6 + 3 agents),
each with an explicit "ceiling check". It records the decisions so any future
session inherits the reasoning, not just the code.

---

## 1. Context & the one principle that carries over

The brain (`Atm_second-brain`) is a finished, zero-dependency Python-stdlib MCP
server over a markdown+git vault. Its governing rule is **"the model proposes, the
server disposes"** — guardrails are code invariants, not prompt hopes.

Surface C extends the same rule to a GUI: the agent *proposes* (speech, a graph
animation, a workspace layout); validated code *disposes* (renders only vetted
components, routes every write through `write_with_provenance`). The avatar is a
**face**, never a new source of truth or a way around a guardrail.

The brain must **not** depend on the app; the app depends on the brain. They are
separate repos. The brain stays usable headless.

---

## 2. Decisions

### D1 — App shell: **Electron + React + (optional) Remotion**
The reasoning loop uses the Claude **Agent SDK (TypeScript)** and the brain is a
**Python stdio child** — both want a real Node runtime with process-spawning,
which is Electron's main process natively. Tauri's bundle-size win evaporates once
you bundle Node for the Agent SDK; a pure web app can't spawn the brain or hold a
key. Fallback: Tauri with a Node sidecar, only if a <20MB binary becomes a hard
requirement.

### D2 — App↔brain boundary: **spawn the stdlib MCP server as a stdio child; speak MCP directly**
The brain already speaks JSON-RPC 2.0/MCP over stdio. The Agent SDK consumes that
via `mcpServers: { brain: { command: "python3", args: ["server/atm_mcp.py"] } }`.
This adds **nothing** to the brain (no HTTP, no deps) and preserves the guardrail
automatically: the app has no write path to the vault except
`mcp__brain__write_with_provenance`.

### D3 — Reasoning loop in MAIN; UI effectors as in-process MCP tools
The agent loop runs in Electron **main** (holds the API key, never exposed to the
renderer). UI effectors (`open_widget`, `animate_graph`, `set_avatar_state`,
`speak`) are in-process MCP tools (`createSdkMcpServer`/`tool`) that forward typed
args to the renderer over IPC. The agent animates the graph with the *same*
tool-call mechanism it uses to recall a memory — one uniform loop. The renderer is
a **pure view**.

### D4 — Rendering: **one WebGLRenderer, two scenes, `clearDepth()` between passes**
Avatar (VRM via `@pixiv/three-vrm`, stylized — not photoreal) in the foreground
scene; the force-directed graph as a "mind-space" background scene. Two scenes
(not `renderOrder`) so each gets its own depth + tonemapping regime; `NeutralTone­
Mapping` so MToon doesn't wash out next to emissive nodes. **Single pinned `three`
instance** (use `three-forcegraph` BYO-three, never the bundled-three build) — the
#1 integration bug otherwise.

### D5 — Graph layout off the render thread; freeze-after-settle
`d3-force-3d` in a **Web Worker**, positions returned as transferable
`Float32Array`. LOD: only simulate the recall 1-hop neighborhood; freeze + pin
everything else. Local reheat on recall (capped alpha) → a ripple, not Obsidian's
"earthquake on reindex". `graph_export` (static map, cached by git `rev`) +
`recall.trace` (per-query animation) are the two feeds.

### D6 — Voice: **local-first cascade**, cloud opt-in
STT `faster-whisper`/`whisper.cpp` + Silero VAD; TTS `Kokoro` (local). Cloud
(`Deepgram` STT, `ElevenLabs` TTS) is **explicit opt-in** for the live-negotiation
path. Cascaded STT→LLM→TTS; stream assistant deltas to TTS at clause boundaries.
First-audio target <700ms on the CHEAP path.

### D7 — Real-time control plane: **liveness is mechanical, intelligence is async, the turn is interruptible**
Three tiers own distinct latency budgets and never block each other:
- **MECH** (deterministic code): VAD, back-channels, the non-suppressible
  recording/identity indicator, idle/gaze — **sub-300ms, never awaits a model**.
- **CHEAP** (Haiku 4.5): short turns, live-negotiation micro-suggestions; owns
  first-audio. **The negotiation widget is hard-pinned and cannot escalate.**
- **FULL** (Opus 4.8, adaptive thinking): deep synthesis, vault writes; latency
  covered honestly by visible THINKING/RECALLING states, never fake filler.

Turn FSM: `idle → listening → thinking → recalling → speaking → (interrupted)`.
Every awaited boundary is cancellable via a per-turn `AbortController`.

### D8 — Barge-in: stop output first, cancel cognition second, settle the vault last
On VAD "user-started-talking": (A) stop+flush TTS so the human hears silence
within 300ms, (B) cancel graph animation + reset avatar pose (MECH), (C)
`abortController.abort()` the SDK turn, (D) discard turn-staged vault writes.
Guards: epoch/`turnId` on every delta/viseme/IPC consumer (drop stale); generation
-tagged audio sink (≤1 frame may leak); **turn-transactional vault writes** so
consistency depends on staged-commit, not on instantaneous cancellation; AEC +
"we're speaking" VAD gate to prevent self-interruption.

### D9 — Generative widgets: **SDUI manifest + closed typed registry**
The agent never generates code/HTML. It emits a validated declarative
`workspace.manifest/1` (which widgets, layout, props, capability scopes); a
hand-rolled validator + closed registry dispose; unknown widget type or capability
is rejected fail-closed. A `workspace-supervisor` mirrors the brain's
`pack-supervisor`; an expertise pack may ship a preferred `workspace.json`. This is
the UI-layer image of "model proposes, server disposes." Freedom is real (infinite
composition within a finite, growing palette); the agent cannot author new widgets
at runtime (that needs a human review→ship step).

### D10 — Privacy/ethics: strictest-regime-by-default
Live transcription defaults to **LOCAL-ONLY + EPHEMERAL** (RAM ring buffer,
crypto-shredded on close). Persisting is explicit opt-in; persisting **audio** is a
separate, harder opt-in (voiceprint/BIPA risk). Assume **all-party consent**
(the most restrictive jurisdiction touching the call governs). Enforceable liveness
rules R1–R7: never claim to be human; no uninvited speech into a room; indicator
never model-suppressible; honest about uncertainty + trust tier; no manipulation;
no faux-intimacy; no confabulated memory. Conversational turns are **not memory**
by default; agent output is excluded from the anti-autophagy human floor.

---

## 3. Contracts (canonical)

- **`recall.trace/1`** (optional, additive to `recall`): `{seeds[], expanded[],
  edges[{src,dst,type}], steps[{kind:seed|expand, node, edge?}], answer_sources[],
  tier, schema}`. Seeds = query-text matches; expanded = 1-hop neighbors; the app
  derives layout/clustering/timing. Implemented in the brain.
- **`graph.export/1`**: `{schema, rev, nodes[{id,title,type,tags}],
  edges[{src,dst,type}]}`. Static map; only resolved edges. Implemented in the brain.
- **`workspace.manifest/1`**: see `schemas/workspace.manifest.schema.json`. Closed
  widget registry, capability scoping, grid layout. Validated headless.
- **Viseme events** (engine-agnostic): `{turnId, target:{kind:viseme|blendshape,id},
  startMs, durMs, weight}` on the **audio clock**, ~50–100ms look-ahead. STT/TTS
  swaps never touch the avatar.

---

## 4. Ceiling check — what current tech can and cannot do (mid-2026)

**Buildable now (the whole architecture):** agent-drives-UI via in-process MCP
tools; stdio brain child; honest graph-traversal animation from a real
`recall.trace`; SDUI cockpit composition; local-first STT/TTS with derived
visemes; cancellable-turn barge-in (Agent SDK `query()` accepts an
`abortController`); MECH sub-300ms liveness; tier routing.

**At/over the ceiling (route around, don't pretend):**
- Sub-300ms full-duplex, human-feel speech-to-speech is **cloud-only**; locally
  expect ~400–700ms and half-duplex turns → covered by honest THINKING states.
- **Photoreal** real-time avatar on a laptop needs cloud Pixel Streaming → we
  choose **stylized VRM** (sidesteps the uncanny valley *and* the GPU ceiling).
- 3D force-graph caps in the low tens of thousands of nodes; 1M-node is 2D-only
  (cosmos.gl) → two-mode design (3D recall scene vs 2D mega-map).
- The agent composes within a finite widget vocabulary; it cannot safely write new
  widgets at runtime.

**The residual unknowns are empirical, not architectural** — they require a
benchmark on the user's real hardware, not more research:
1. VRM (spring bones + morphs, CPU/render-thread) + live graph at 60fps on an
   integrated GPU. Fallback fully specified: degrade the **graph** to a 2D HUD via
   an FPS watchdog; never degrade the avatar.
2. End-to-end local first-audio latency holding <700ms on a typical laptop.
3. AEC quality for self-interruption robustness in a real (noisy) room.

This is why the workflow is closed: further rounds would only restate "go
measure on the device."

---

## 5. Build order (incremental, de-risked)

1. Graph viewer reading the index (proves `graph_export` + `recall.trace`).
2. Talking avatar (VRM + viseme path).
3. One widget: `live-transcript`.
4. Generative workspace composition (SDUI supervisor + the negotiation cockpit).

Everything feeding those is validated **headless** (schemas, supervisor, reducers,
FSM, router) by `npm run selftest`; only the pixels-and-microphone last mile needs
the user's Windows machine.
