---
name: vault-review
description: Triage the inbox and maintain note quality — process captured notes into the right PARA folder, add links and tags, verify citations, and keep a small review queue. Use when asked to review, triage, clean up, or process the inbox, or to run periodic maintenance. Only appends reversible artifacts.
---

# Vault review

Maintenance pulls quality up without overwriting the human. The maintainer only
**appends reversible artifacts** — suggestions, links, tags — never destructive
rewrites of human content.

## Triage loop (inbox → filed)

For each note in `vault/00-inbox/`:

1. Read it. Decide its `type` and the right PARA home (project/area/resource) or
   `concepts/` if it's an atomic idea.
2. Add `tags` and at least one `[[link]]` so it isn't an orphan. Wire durable
   ideas into a relevant MOC.
3. Run `citation_verify` if it makes claims; fix or flag broken citations.
4. Move/promote via `write_with_provenance`. Never edit `author: human` notes in
   place — propose a linked companion note instead.

## Keep the queue small

Cap the active review queue at ~7 items. If more pile up, surface the backlog to
the human rather than silently churning. Use confidence gating: only auto-apply
changes you're confident are reversible and clearly correct; otherwise propose.

## Idempotency

Re-running review on an unchanged note should be a no-op. Don't re-tag or
re-link what's already done; check before adding.

## Health signals to watch

- Orphans (no inbound/outbound links), broken citations, notes missing required
  frontmatter, and a rising share of agent-authored vs human-authored mass
  (anti-autophagy). Report these; don't paper over them.
