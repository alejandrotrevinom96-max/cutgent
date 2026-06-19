# ATM Cockpit — Surface C

A desktop client that gives the [ATM second brain](../Atm_second-brain) a visible
**body** (a VRM 3D avatar you talk to) and a live **mind** (an Obsidian-style
knowledge graph that animates the brain's *actual* recall traversal), plus
**generative widgets** the agent composes on demand (e.g. a negotiation cockpit).

> The avatar is a face, never a new source of truth. Every read goes through the
> brain's `recall`; every write through `write_with_provenance`. "The model
> proposes, the server disposes" — extended to a GUI. See
> [`docs/adr/0001-surface-c.md`](docs/adr/0001-surface-c.md) for the full design
> and the technology-ceiling analysis.

## The four features

1. **Graph viewer** reading the brain's index (`graph_export`) and animating the
   honest `recall.trace` (gold = your words matched a note; blue = a 1-hop link).
2. **Talking avatar** — VRM + viseme lip-sync on the audio clock, blink/idle/gaze.
3. **Live-transcript widget** — local, ephemeral transcription (mic), the data path
   for things like live deal negotiation.
4. **Generative workspace composition** — the agent emits a validated
   `workspace.manifest/1`; a closed widget registry + capability scoping render it
   fail-closed (the same validator runs in the headless selftest).

## Architecture (one breath)

```
Electron MAIN (Node) — holds the key, runs the agent loop, spawns the brain
  ├─ Claude Agent SDK (optional; recall-grounded fallback without a key)
  ├─ in-process UI tools: open_widget / animate_graph / speak
  └─ stdio child ──> python3 ../Atm_second-brain/server/atm_mcp.py  (MCP, zero-dep)
        │ contextIsolation:true, typed IPC only (no fs/exec/key in renderer)
RENDERER (React + three.js) — pure view: VRM avatar, graph canvas, widgets, voice
```

## Run it (your machine)

```bash
npm install
# point at your brain repo if it isn't the sibling ../Atm_second-brain:
export ATM_BRAIN=/path/to/Atm_second-brain
# optional — enables the full agentic loop (otherwise a recall-grounded fallback runs):
export ANTHROPIC_API_KEY=sk-...
npm run dev
```

Drop your model at `public/avatar.vrm` (a placeholder head renders until you do).

## Validate without a GUI (what CI / this build runs)

Both gates are **zero-install** (Node built-ins only):

```bash
npm run selftest      # schemas + supervisor + every pure reducer/FSM/router + fixtures
npm run integration   # spawns the REAL python brain and drives it over MCP end-to-end
npm run validate      # both
```

`npm run typecheck` (after `npm install`) typechecks the TS app layer.

### What's proven headless vs needs your machine

- **Proven here (green):** the manifest schema + `workspace-supervisor` (accepts the
  negotiation cockpit, rejects a battery of invalid/over-reaching manifests), the
  graph trace reducer, transcript store, viseme map + lip-sync timeline, the turn
  FSM (incl. barge-in ordering), the tier router (incl. the negotiation no-escalation
  pin), and the **full app↔brain MCP spine** (`graph_export` + `recall.trace`).
- **Needs your Windows machine (the last mile):** the three.js/VRM render + real
  lip-sync framerate, the graph canvas at interactive FPS, and **real STT/TTS**
  (the browser engines run on-device; swap in local Whisper/Kokoro behind the
  provider interfaces). The ADR's §4 ceiling check explains why these are empirical,
  not architectural.

## Layout

```
docs/adr/0001-surface-c.md     the design + ceiling analysis (start here)
schemas/                       workspace.manifest / recall.trace / graph.export
fixtures/                      negotiation cockpit + invalid manifests + data fixtures
src/shared/**.mjs              PURE, zero-dep logic (validated headless; imported by the UI)
src/main/                      Electron main, brainClient (MCP stdio), agent loop
src/preload/                   the security bridge (typed IPC only)
src/renderer/                  React UI: avatar, graph, widgets, voice providers
tools/selftest.mjs             headless gate (no GUI, no install)
tools/integration.mjs          spawns the real brain over MCP
```

## Depends on the brain, never the reverse

The brain stays zero-dependency and usable headless. This app consumes it. Keep
them in separate repos.
