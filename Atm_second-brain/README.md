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

- [x] **P0 — Scaffold + durability** (this commit): directory tree, schema v1
      contract, conventions, template, example note.
- [ ] P1 — MCP core skeleton (JSON-RPC 2.0 over stdio, FTS5 probe)
- [ ] P2 — Parser + index + `reindex`
- [ ] P3 — `recall` + graph + `resolve_tier` + `citation_verify`
- [ ] P4 — `write_with_provenance` (validation gate)
- [ ] P5 — `selftest` regression corpus
- [ ] P6 — Hooks + `.mcp.json` + capture skills + MECH mode
- [ ] P7 — Base skills + pack-supervisor
- [ ] P8 — Pilot expertise packs (incl. image & video editing/generation)

## Principles that don't bend

- **Plain markdown survives** — every note is a greppable `.md`; binaries only in `attachments/`.
- **Fail-closed trust tiers** — unknown provenance is treated as least-trusted.
- **Anti-autophagy** — retrieval enforces a human-information floor so the agent can't feed on its own output.
- **Capture is never blocked** — even with no model and no network (MECH mode).
- **Cheapest-correct-first** — MECH (grep/git, $0) → CHEAP (small model) → FULL.
