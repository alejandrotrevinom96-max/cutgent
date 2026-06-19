# ATM Second Brain

A hybrid, Obsidian-style second brain shared by a **human** (PARA + Obsidian) and an
**AI agent** (its own local MCP server). Markdown + git is the only source of truth.
**Zero external runtime dependencies** — the server is Python 3.11+ standard library
only. A companion desktop app (**[atm-cockpit](#companion-app-atm-cockpit)**) gives it
a face, a voice, and a live graph.

> **The one rule:** the model proposes, the server disposes. Every guardrail is a
> code invariant in the MCP server + git, never a prompt hope.

---

## Start here

1. **[SETUP.md](SETUP.md)** — get it running in ~15 min (Python, Obsidian, Claude Code).
2. Open `vault/` in Obsidian and read **`vault/meta/first-run.md`** ([[first run]]).
3. Browse what the agent can do: **`vault/mocs/expertise-packs.md`** ([[Expertise Packs]]).
4. Sanity check anytime: `python3 scripts/brain.py doctor` then `… selftest`.

---

## How it works (two surfaces)

- **Surface A — Claude Code over the vault.** The native agent loop + filesystem
  (read/grep/glob/bash) + Skills + hooks + git does most of the work. Collapses RAG
  and orchestration to near zero.
- **Surface B — a thin stdlib MCP server** (`server/atm_mcp.py`) exposing the
  canonical, server-enforced operations:
  `recall · write_with_provenance · reindex · resolve_tier · citation_verify ·
  graph_export · consolidate · mech_status`.

Skills/hooks are a removable convenience layer. The MCP server + git are the
non-removable enforcement core.

## What's inside

```
_schema/        Immutable, append-only note contract (schema.vN.{md,json} + CURRENT)
_migrations/    The only path vN -> vN+1 (idempotent, dry-run, git-revert = rollback)
vault/          The notes (PARA + Zettelkasten + MOCs)
  00-inbox 01-projects 02-areas 03-resources 04-archive   PARA, by actionability
  concepts/  atomic evergreen notes        mocs/  Home + Expertise Packs
  personal/  YOUR layer: identity + one note per pack (overrides generic advice)
  meta/      first-run onboarding, conventions   journal/ daily notes   templates/
  .obsidian/ shipped Obsidian config (wikilinks, daily notes, attachments)
server/         The stdlib MCP server (parser, index, recall, writer, trust, migrate…)
scripts/brain.py  CLI: doctor · selftest · reindex · recall · capture · migrate · eval
scripts/bench.py  Scale benchmark (1k/10k/50k): reindex + recall latency + floor
evals/          Eval harness: 31 specs scoring answers against each pack's rubric
selftest/       The guardrail corpus (33 invariants, 100% covered) — `brain.py selftest`
.claude/skills/ 5 base skills + pack-supervisor + 31 expertise packs (+ template)
```

## The expertise system

31 domain packs, each an Agent Skill with a **binary rubric** (no "you are an expert"
persona), grouped:

- **Craft / Create** — web-design, copywriting, image-video-editing-generation,
  3d-animation, writing, cinematography, photography, sound-audio, brand-identity.
- **Build / Analyze** — software-engineering, data-analysis, product-design-ux.
- **Business / Money** — business-strategy, marketing-growth, sales, negotiation,
  personal-finance, business-finance, content-strategy, legal-literacy.
- **People / Self** — communication, counsel, leadership-management, decision-making,
  learning, productivity, health-fitness, psychology, philosophy, relationships, career.

The non-generic ones carry their honest caveats in the pack itself: psychology is
evidence-graded (flags replication-crisis findings) and bounded against therapy;
philosophy is anti-dogmatic; legal-literacy and business-finance are education, not
advice (they name when to get a lawyer / CPA); relationships is reflective support,
not couples therapy.

Each pack is bridged to a **`personal/<domain>`** note. A pack only *overrides* generic
best practice once you fill that note in and confirm it (the agent can't fake the
confirmation). That's what turns a generic expert into *your* expert — start with
[[first run]].

## Principles that don't bend

- **Plain markdown survives** — every note is a greppable `.md`; binaries only in `attachments/`.
- **Fail-closed trust tiers** — `self-authored · human-confirmed · externally-ingested`; unknown ⇒ least.
- **Anti-autophagy** — retrieval enforces a human-information floor so the agent can't feed on its own output.
- **Capture is never blocked** — works with no model, no network (`scripts/capture.sh`, MECH mode).
- **Migration is the only path** to a new schema; `git revert` is the rollback.

## Companion app (atm-cockpit)

A separate Electron repo, **[atm-cockpit](../atm-cockpit)**, is a *client* over this
brain: a VRM avatar you talk to, a live force-directed graph that animates the brain's
real `recall` traversal, voice I/O, and generative widgets (e.g. a negotiation
cockpit). It depends on the brain; the brain never depends on it. See its README and
`docs/adr/0001-surface-c.md`.

## Status

Built piece by piece, each gated by an audit. Brain selftest: **ALL GREEN — 33
invariants, 100% coverage.** P0 scaffold/durability · P1 MCP core · P2 parser+index ·
P3 recall+graph+tiers+citations · P4 write_with_provenance · P5 selftest corpus ·
P6 hooks+capture+MECH · P7 base skills · P8 expertise packs · P9 graph contracts
(recall.trace + graph_export) · P10 personal layer + MOCs · P11 PARA templates +
first-run · P12 migration runner · P13 Obsidian config + SETUP + doctor ·
**P14 hybrid retrieval** (RRF: lexical+TF-IDF+graph, PRF, pluggable embeddings) ·
**P15 eval harness** (measurable rubrics) · **P16 scale** (mtime fast-path; recall
~0.3s @ 10k, see `docs/BENCHMARKS.md`) · **P17 guarded consolidation** (anti-autophagy).

MIT licensed (`LICENSE`).
