# ATM Second Brain

A hybrid, Obsidian-style second brain shared by a human (via the
[PARA](https://fortelabs.com/blog/para/) method + Obsidian) **and** an AI agent
(via its own local MCP server). Markdown + git is the only source of truth.
**Zero external runtime dependencies** — the server is Python 3.11+ standard
library only.

## Design in one breath

> The model proposes, the server disposes.

Every guardrail is a code invariant living in the MCP server + git, never a prompt
hope. Two surfaces operate over the same vault:

- **Surface A — Claude Code over the vault.** The native agent loop +
  filesystem (read/grep/glob/bash) + Skills + hooks + git does most of the work.
  This collapses RAG and orchestration to nearly zero.
- **Surface B — a thin stdlib MCP server** (`server/atm_mcp.py`) exposing ~6
  canonical, server-enforced operations:
  `recall · write_with_provenance · reindex · resolve_tier · citation_verify · mech.*`.

Skills and hooks are a removable convenience/UX layer. The MCP server + git are the
non-removable enforcement core.

## Layout

```
_schema/        Immutable, append-only note contract (schema.vN.{md,json} + CURRENT)
_migrations/    One idempotent migration per schema bump; git revert = rollback
vault/          The notes themselves (PARA + Zettelkasten/Evergreen + MOCs)
  00-inbox/       Capture lands here; never blocked
  01-projects/    PARA: active, goal-bound
  02-areas/       PARA: ongoing responsibilities
  03-resources/   PARA: topics of interest
  04-archive/     PARA: inactive
  concepts/       Atomic evergreen notes
  mocs/           Maps of Content (navigation hubs)
  meta/           Conventions, vault-about-vault notes
  agent/          The agent's own working notes
  templates/      Note templates
  attachments/    Binaries referenced by notes (never note content itself)
server/         The stdlib MCP server
selftest/       Guardrail regression corpus (stdlib unittest, zero-dep)
.claude/skills/ Agent Skills: vault conventions, capture, review, git, expertise packs
scripts/        Helper scripts (e.g. model-free capture)
docs/adr/       Architecture Decision Records
```

## Status

Built piece by piece, each gated by an audit before the next begins.

- [x] **P0 — Scaffold + durability**: directory tree, schema v1 contract,
      conventions, template, example note.
- [x] **P1 — MCP core skeleton**: stdlib JSON-RPC 2.0 over stdio, FTS5 probe,
      canonical tool registry.
- [x] **P2 — Parser + index + `reindex`**: stdlib YAML, SQLite index, idempotent
      incremental reindex, link resolution.
- [x] **P3 — `recall` + graph + `resolve_tier` + `citation_verify`**: ranked
      retrieval with the human-information floor, anti-laundering tier resolution.
- [x] **P4 — `write_with_provenance`**: the validation/provenance gate (schema,
      immutability, anti-laundering, optimistic locking).
- [x] **P5 — `selftest` regression corpus**: red/green fixtures + invariant
      registry + 100% coverage-as-test.
- [x] **P6 — Hooks + `.mcp.json` + capture + MECH mode**: model-free capture,
      degraded-mode reporting.
- [x] **P7 — Base skills + pack-supervisor**: vault-conventions/capture/review/git
      + composition meta-skill + pack template.
- [x] **P8 — Pilot expertise packs**: image & video editing/generation (requested),
      web-design, copywriting — each with exemplars, binary rubric, anti-patterns,
      sources.

Run the full guardrail corpus any time with `python3 scripts/brain.py selftest`.

### Adding more expertise domains

The pilot packs prove the template. Adding the remaining life areas (counsel/
friend, business, 3D/animation, and the rest) is a matter of copying
`.claude/skills/expertise-pack-template/` and filling in the four companion files
— no engine changes required.

## Principles that don't bend

- **Plain markdown survives** — every note is a greppable `.md`; binaries only in `attachments/`.
- **Fail-closed trust tiers** — unknown provenance is treated as least-trusted.
- **Anti-autophagy** — retrieval enforces a human-information floor so the agent can't feed on its own output.
- **Capture is never blocked** — even with no model and no network (MECH mode).
- **Cheapest-correct-first** — MECH (grep/git, $0) → CHEAP (small model) → FULL.
